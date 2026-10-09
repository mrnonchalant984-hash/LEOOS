import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

const endpoints = new Map([
  ['GET /api/v1/projects', '/api/v1/projects'],
  ['GET /api/v2/me', '/api/v2/me'],
  ['GET /api/v2/projects', '/api/v2/projects'],
  ['POST /api/v2/projects', '/api/v2/projects'],
]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const method = typeof body.method === 'string' ? body.method.toUpperCase() : 'GET';
  const path = typeof body.path === 'string' ? body.path : '';
  const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
  const target = endpoints.get(`${method} ${path}`);
  if (!target) return NextResponse.json({ error: 'This endpoint is not available in the playground.' }, { status: 400 });
  if (!/^leo_[A-Za-z0-9_-]{20,160}$/.test(apiKey)) return NextResponse.json({ error: 'Enter a valid API key. It is used only for this request.' }, { status: 400 });
  const response = await fetch(new URL(target, req.url), {
    method,
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'x-request-id': randomUUID() },
    body: method === 'POST' ? JSON.stringify(body.body || {}) : undefined,
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({ error: { message: 'The API returned a non-JSON response.' } }));
  return NextResponse.json({ status: response.status, headers: { 'x-request-id': response.headers.get('x-request-id') }, body: result }, { status: 200 });
}
