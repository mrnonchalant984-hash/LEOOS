import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';
import pdf from 'pdf-parse';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'file-review', 5, 24 * 3600);
  if (limited) return limited;
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return NextResponse.json({ error: 'Gemini is not configured for file review.' }, { status: 503 });
  try {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'File required' }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const client = new GoogleGenAI({ apiKey: key });
    let prompt = 'Review this uploaded project file. Give exactly 3 practical improvements focused on code quality, UX/conversion, and production readiness.';
    const parts: Array<Record<string, unknown>> = [];
    if (file.type.startsWith('image/')) {
      prompt = 'Review this website/design image. Give exactly 3 practical improvements covering hierarchy, UX/conversion, and visual quality.';
      parts.push({ inlineData: { mimeType: file.type, data: bytes.toString('base64') } });
    } else {
      let text = '';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        text = (await pdf(bytes)).text.slice(0, 15000);
      } else if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(bytes);
        for (const name of Object.keys(zip.files).filter(name => /\.(tsx?|jsx?|css|json|md|html)$/.test(name)).slice(0, 30)) {
          text += `\n--- ${name} ---\n${(await zip.file(name)?.async('string') || '').slice(0, 3000)}`;
        }
      } else text = bytes.toString('utf8').slice(0, 15000);
      parts.push({ text: `${prompt}\n\n${text}` });
    }
    if (!parts.length || file.type.startsWith('image/')) parts.push({ text: prompt });
    const result = await client.models.generateContent({ model: process.env.LEO_CHAT_MODEL?.trim() || 'gemini-3.8-flash', contents: [{ role: 'user', parts }] });
    return NextResponse.json({ reply: result.text?.trim() || 'Gemini returned an empty review.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Gemini file review failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Gemini file review failed. Check the file type, size, and Gemini model access.' }, { status: 502 });
  }
}
