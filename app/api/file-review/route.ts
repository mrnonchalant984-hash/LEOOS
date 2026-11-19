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
    if (file.size < 1 || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Review files must be between 1 byte and 10 MB.' }, { status: 413 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const client = new GoogleGenAI({ apiKey: key });
    const specialSourceNames = new Set(['dockerfile','makefile','procfile','gemfile','pipfile','requirements.txt','cargo.toml','go.mod','go.sum']);
    const sourceExtensions = /\.(?:html?|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|mts|cts|vue|svelte|astro|py|pyi|ipynb|go|rs|java|kt|kts|swift|rb|php|sql|sh|bash|zsh|ps1|bat|cmd|c|h|cc|cpp|hpp|cs|fs|fsx|scala|clj|ex|exs|erl|hrl|dart|lua|r|jl|pl|pm|groovy|gradle|xml|json|jsonc|yaml|yml|toml|ini|cfg|conf|dockerfile|tf|hcl|md|mdx|txt|csv)$/i;
    let prompt = 'Perform a source-level code review of the supplied file(s). Identify concrete defects and cite exact file paths and line numbers where possible. Assess language-specific correctness, runtime behavior, security, data validation, error handling, performance, maintainability, tests and production readiness. Separate confirmed defects from risks and recommendations. Do not invent code that is not present. If the input is a website project, review its source files and configuration, not only rendered HTML. If the project contains Python or other backend languages, inspect those too. Return a concise prioritized report with severity, evidence, impact and recommended fix.';
    const parts: Array<Record<string, unknown>> = [];
    if (file.type.startsWith('image/')) {
      prompt = 'Review this website/design image. Give practical improvements covering hierarchy, UX, accessibility and visual quality.';
      parts.push({ inlineData: { mimeType: file.type, data: bytes.toString('base64') } });
    } else {
      let text = '';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        text = (await pdf(bytes)).text.slice(0, 30000);
      } else if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(bytes);
        const entries = Object.entries(zip.files).filter(([name, entry]) => {
          const normalized = name.replace(/\\/g, '/');
          const basename = normalized.split('/').pop()?.toLowerCase() || '';
          return !entry.dir && !normalized.startsWith('/') && !normalized.split('/').includes('..') &&
            (sourceExtensions.test(normalized) || specialSourceNames.has(basename)) &&
            !/(?:^|\/)(?:node_modules|\.git|\.next|dist|build|coverage|vendor)\//i.test(normalized);
        }).slice(0, 40);
        let total = 0;
        for (const [name, entry] of entries) {
          const declaredSize = Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0);
          if (declaredSize > 20_000 || total + declaredSize > 180_000) continue;
          const source = await entry.async('string');
          const clipped = source.slice(0, 12_000);
          total += Buffer.byteLength(clipped);
          if (total > 180_000) break;
          text += `\n--- SOURCE FILE: ${name} ---\n${clipped}`;
        }
        if (!text) return NextResponse.json({ error: 'The ZIP contains no supported, readable source files within the review limits.' }, { status: 415 });
      } else {
        const filename = file.name.replace(/\\/g, '/').split('/').pop() || 'uploaded-source';
        if (!sourceExtensions.test(filename) && !specialSourceNames.has(filename.toLowerCase())) return NextResponse.json({ error: 'Unsupported source file. Upload a supported code/configuration file or a ZIP project archive.' }, { status: 415 });
        text = bytes.toString('utf8').slice(0, 30000);
        if (text.includes('\u0000')) return NextResponse.json({ error: 'Binary files cannot be reviewed as source code.' }, { status: 415 });
        text = `--- SOURCE FILE: ${filename} ---\n${text}`;
      }
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
