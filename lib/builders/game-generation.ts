import { Script } from 'node:vm';
import { normalizeIdePath, validateIdeFiles } from '../ide-files.ts';

export type GeneratedGameFiles = Record<string, string>;

export function parseGeneratedGameFiles(text: string): GeneratedGameFiles {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try { value = JSON.parse(trimmed); } catch { throw new Error('Leo returned an invalid project-file response. Retry generation; no files were saved.'); }
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).files : null;
  const files: Record<string, string> = {};
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      if (typeof row.path === 'string' && typeof row.content === 'string') files[row.path] = row.content;
    }
  } else if (candidate && typeof candidate === 'object') {
    for (const [path, content] of Object.entries(candidate as Record<string, unknown>)) {
      if (typeof content === 'string') files[path] = content;
    }
  }
  if (!validateIdeFiles(files)) throw new Error('Leo generated unsafe, oversized, or invalid file paths. No files were saved.');
  if (!files['index.html'] || !/<html\b/i.test(files['index.html']) || !/<body\b/i.test(files['index.html'])) {
    throw new Error('Leo did not return a runnable index.html entry point. No files were saved.');
  }
  if (!Object.keys(files).some(path => /\.(?:js|mjs|ts|html)$/i.test(path))) {
    throw new Error('Generated project contains no executable browser entry files. No files were saved.');
  }
  return files;
}

export function gameFileValidationErrors(files: Record<string, string>) {
  const errors: string[] = [];
  if (!validateIdeFiles(files)) errors.push('The source-file map is invalid or exceeds the workspace limits.');
  const html = files['index.html'];
  if (typeof html !== 'string') errors.push('Missing required entry point: index.html.');
  else {
    if (!/<html\b/i.test(html) || !/<body\b/i.test(html)) errors.push('index.html must contain an HTML document with html and body elements.');
    if (!/<canvas\b|<script\b/i.test(html)) errors.push('index.html has no canvas or script entry point.');
    if (/<script[^>]+src=["'](?:file:|javascript:)/i.test(html)) errors.push('index.html references an unsafe script URL.');
  }
  for (const path of Object.keys(files)) {
    if (!normalizeIdePath(path)) errors.push(`Invalid source path: ${path.slice(0, 80)}.`);
  }
  return errors;
}


/** Syntax-check classic browser JavaScript without executing untrusted game code. ES modules are reported as uncompiled because Node's module parser is not enabled in this runtime. */
export function gameJavaScriptSyntaxErrors(files: Record<string, string>): string[] {
  const errors: string[] = [];
  const check = (label: string, source: string, module = false) => {
    if (module || /^\s*(?:import\s|export\s)/m.test(source)) return;
    try { new Script(source, { filename: label }); }
    catch (error) { errors.push(`JavaScript syntax error in ${label}: ${error instanceof Error ? error.message.slice(0, 220) : 'parse failed'}`); }
  };
  for (const [path, content] of Object.entries(files)) {
    if (/\.(?:js|cjs)$/i.test(path)) check(path, content);
    if (/\.mjs$/i.test(path)) check(path, content, true);
    if (path.toLowerCase() === 'index.html') {
      const scripts = content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi);
      let index = 0;
      for (const match of scripts) {
        index++;
        if (/\bsrc\s*=/.test(match[1])) continue;
        check(`index.html inline script ${index}`, match[2], /\btype\s*=\s*["']module["']/i.test(match[1]));
      }
    }
  }
  return errors;
}
