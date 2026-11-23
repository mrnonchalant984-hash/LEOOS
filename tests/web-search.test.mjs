import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWeb, WebSearchError } from '../lib/ai/web-search.ts';

test('web search requires an explicitly configured provider key', async () => {
  const previous = process.env.TAVILY_API_KEY;
  try {
    delete process.env.TAVILY_API_KEY;
    await assert.rejects(searchWeb('test query'), error =>
      error instanceof WebSearchError && error.status === 503 && /TAVILY_API_KEY/.test(error.message));
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test('web search sends credentials in the request body and returns validated unique sources', async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  const previousFetch = globalThis.fetch;
  try {
    process.env.TAVILY_API_KEY = 'test-secret';
    let capturedUrl = '';
    let capturedBody = {};
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body || '{}'));
      return Response.json({ results: [
        { title: 'Example', url: 'https://example.com/article', content: 'Relevant evidence.' },
        { title: 'Duplicate', url: 'https://example.com/article', content: 'Duplicate result.' },
        { title: 'Unsafe', url: 'javascript:alert(1)', content: 'Ignore.' },
        { title: 'Invalid', url: 'not-a-url', content: 'Ignore.' },
      ] });
    };
    const results = await searchWeb('test query');
    assert.equal(capturedUrl, 'https://api.tavily.com/search');
    assert.equal(capturedUrl.includes('test-secret'), false);
    assert.equal(capturedBody.api_key, 'test-secret');
    assert.equal(capturedBody.search_depth, 'basic');
    assert.equal(capturedBody.max_results, 6);
    assert.deepEqual(results, [{ title: 'Example', url: 'https://example.com/article', content: 'Relevant evidence.' }]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});

test('web search quota exhaustion fails closed without a paid fallback', async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  const previousFetch = globalThis.fetch;
  try {
    process.env.TAVILY_API_KEY = 'test-secret';
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    await assert.rejects(searchWeb('test query'), error =>
      error instanceof WebSearchError && error.status === 429 && /No paid fallback/.test(error.message));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});
