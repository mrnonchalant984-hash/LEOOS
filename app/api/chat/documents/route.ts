import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import {
  buildChatDocument,
  extractChatDocumentText,
  getChatDocumentFormat,
  getChatDocumentMimeType,
  MAX_CHAT_DOCUMENT_BYTES,
} from '@/lib/chat-documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'leo-files';
const MAX_GENERATED_TEXT = 80_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFilename(value: string, format: string) {
  const stem = value.replace(/\.[^.]+$/, '').normalize('NFKC').replace(/[^\p{L}\p{N}._ -]+/gu, '').trim().replace(/[. ]+$/g, '').slice(0, 100) || 'leo-document';
  return `${stem}.${format}`;
}

function responseDocument(id: string, filename: string, mimeType: string, previewText: string) {
  return {
    assetId: id,
    fileName: filename,
    mimeType,
    previewText: previewText.slice(0, 2000),
    previewUrl: `/api/media/${encodeURIComponent(id)}?view=1`,
    downloadUrl: `/api/media/${encodeURIComponent(id)}?download=1`,
  };
}

async function uploadPrivateDocument(
  userId: string,
  filename: string,
  format: string,
  mimeType: string,
  bytes: Buffer,
  metadata: Record<string, unknown>,
) {
  const db = adminSupabase();
  const assetId = randomUUID();
  const path = `chat-documents/${userId}/${assetId}.${format}`;
  const upload = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimeType,
    cacheControl: '3600',
    upsert: false,
  });
  if (upload.error) throw new Error('The document could not be saved to private storage.');
  const inserted = await db.from('media_assets').insert({
    id: assetId,
    user_id: userId,
    kind: 'other',
    bucket: BUCKET,
    storage_path: path,
    mime_type: mimeType,
    size_bytes: bytes.length,
    metadata: { chat_document: true, file_name: filename, document_format: format, ...metadata },
  }).select('id').single();
  if (inserted.error || !inserted.data) {
    const cleanup = await db.storage.from(BUCKET).remove([path]);
    if (cleanup.error) console.error('Unregistered chat document cleanup failed', { userId, path, error: cleanup.error.message });
    throw new Error('The document was uploaded but its private asset record could not be created.');
  }
  return inserted.data.id as string;
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  }
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Sign in to add a document to Leo Chat.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'leo-chat-document-upload', 10, 60);
  if (limited) return limited;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a document file to upload.' }, { status: 400 });
    if (file.size < 1 || file.size > MAX_CHAT_DOCUMENT_BYTES) {
      return NextResponse.json({ error: 'Documents must be between 1 byte and 10 MB.' }, { status: 413 });
    }
    const format = getChatDocumentFormat(file.name);
    if (!format) return NextResponse.json({ error: 'Supported files: PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, and JSON.' }, { status: 415 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const extractedText = await extractChatDocumentText(file.name, bytes);
    const filename = safeFilename(file.name, format);
    const assetId = await uploadPrivateDocument(auth.user.id, filename, format, getChatDocumentMimeType(format), bytes, {
      source: 'chat_upload',
      extracted_text: extractedText,
    });
    return NextResponse.json({
      document: responseDocument(assetId, filename, getChatDocumentMimeType(format), extractedText),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The document could not be read.';
    console.error('Leo Chat document upload failed', { userId: auth.user.id, message });
    const status = /private storage|asset record/i.test(message) ? 502 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  }
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Sign in to create a downloadable document.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'leo-chat-document-create', 12, 60);
  if (limited) return limited;
  let uploaded: { id: string; path: string } | null = null;
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'A valid JSON document request is required.' }, { status: 400 });
    const sessionId = body.session_id;
    const content = body.content;
    const requestedFormat = body.format;
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    if (typeof sessionId !== 'string' || !UUID.test(sessionId) || typeof content !== 'string' || !content.trim() || content.length > MAX_GENERATED_TEXT || typeof requestedFormat !== 'string' || !['pdf', 'docx', 'txt', 'md'].includes(requestedFormat)) {
      return NextResponse.json({ error: 'A saved assistant reply, title, and supported file format are required.' }, { status: 400 });
    }
    const format = requestedFormat as 'pdf' | 'docx' | 'txt' | 'md';
    const filename = safeFilename(title || 'Leo response', format);
    const db = adminSupabase();
    const { data: chat, error: chatError } = await db.from('chats_v2')
      .select('messages')
      .eq('id', sessionId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (chatError) return NextResponse.json({ error: 'Chat history could not be checked.' }, { status: 503 });
    const messages = Array.isArray(chat?.messages) ? chat.messages as Array<Record<string, unknown>> : [];
    const normalizedContent = content.replace(/^(?:Hello!|Welcome back Boss Leonard 👑)\n\n/, '');
    let index = -1;
    for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
      if (messages[cursor].role === 'assistant' && messages[cursor].content === normalizedContent) {
        index = cursor;
        break;
      }
    }
    const target = messages[index];
    if (index < 0 || !target) {
      return NextResponse.json({ error: 'That chat reply changed. Reload the conversation and try again.' }, { status: 409 });
    }

    const bytes = await buildChatDocument(format, title || 'Leo response', content);
    if (bytes.length > MAX_CHAT_DOCUMENT_BYTES) return NextResponse.json({ error: 'The generated document exceeds the 10 MB download limit.' }, { status: 413 });
    const mimeType = getChatDocumentMimeType(format);
    const assetId = await uploadPrivateDocument(auth.user.id, filename, format, mimeType, bytes, {
      source: 'chat_generated',
      title: title || 'Leo response',
      preview_text: content.slice(0, 2000),
    });
    const path = `chat-documents/${auth.user.id}/${assetId}.${format}`;
    uploaded = { id: assetId, path };
    const currentDocuments = Array.isArray(target.documents) ? target.documents.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
    const document = responseDocument(assetId, filename, mimeType, content);
    messages[index] = {
      ...target,
      documents: [...currentDocuments, { assetId, fileName: filename, mimeType, previewText: document.previewText, previewUrl: document.previewUrl, downloadUrl: document.downloadUrl }],
    };
    const { error: saveError } = await db.from('chats_v2')
      .update({ messages, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', auth.user.id);
    if (saveError) {
      await db.from('media_assets').delete().eq('id', assetId).eq('user_id', auth.user.id);
      const cleanup = await db.storage.from(BUCKET).remove([path]);
      if (cleanup.error) console.error('Generated chat document cleanup failed', { userId: auth.user.id, assetId, error: cleanup.error.message });
      uploaded = null;
      return NextResponse.json({ error: 'The document was created, but its chat download link could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ document }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (uploaded) {
      const db = adminSupabase();
      await db.from('media_assets').delete().eq('id', uploaded.id).eq('user_id', auth.user.id);
      const cleanup = await db.storage.from(BUCKET).remove([uploaded.path]);
      if (cleanup.error) console.error('Generated chat document cleanup failed', { userId: auth.user.id, assetId: uploaded.id, error: cleanup.error.message });
    }
    const message = error instanceof Error ? error.message : 'The document could not be created.';
    console.error('Leo Chat document creation failed', { userId: auth.user.id, message });
    return NextResponse.json({ error: 'The downloadable document could not be created. Try again.' }, { status: 500 });
  }
}
