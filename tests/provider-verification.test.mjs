import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProviderCredential } from '../lib/integrations/provider-verification.ts';

const providers = [
  ['github', { token: 'test-token' }, 'api.github.com/user'],
  ['vercel', { token: 'test-token' }, 'api.vercel.com/v2/user'],
  ['supabase', { project_url: 'https://sample.supabase.co', access_token: 'test-token' }, 'api.supabase.com/v1/projects/sample'],
  ['firebase', { project_id: 'sample-project', access_token: 'test-token' }, 'firebase.googleapis.com/v1beta1/projects/sample-project'],
  ['openai', { api_key: 'test-key' }, 'api.openai.com/v1/models'],
  ['anthropic', { api_key: 'test-key' }, 'api.anthropic.com/v1/models'],
  ['google_gemini', { api_key: 'test-key' }, 'generativelanguage.googleapis.com/v1beta/models'],
  ['meta', { access_token: 'test-token' }, 'graph.facebook.com/v23.0/me/permissions'],
  ['youtube', { access_token: 'test-token' }, 'youtube.googleapis.com/youtube/v3/channels'],
];

test('provider verification uses each provider-specific endpoint and returns granted scopes', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({
      data: [
        { permission: 'pages_read_engagement', status: 'granted' },
        { permission: 'ungranted_scope', status: 'declined' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    for (const [provider, config, endpoint] of providers) {
      const result = await verifyProviderCredential(provider, config);
      assert.equal(result.status, 'verified', provider);
      assert.ok(requests.at(-1).url.includes(endpoint), provider);
    }
    const meta = await verifyProviderCredential('meta', { access_token: 'test-token' });
    assert.deepEqual(meta.scopes, ['pages_read_engagement']);

    const whatsapp = await verifyProviderCredential('whatsapp_business', {
      access_token: 'test-token',
      phone_number_id: '1234567890',
    });
    assert.equal(whatsapp.status, 'verified');
    assert.equal(requests.length, providers.length + 3);
    assert.ok(requests.at(-1).url.includes('/me/permissions'));
    assert.deepEqual(whatsapp.scopes, ['pages_read_engagement']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider verification reports rejected credentials without exposing provider response bodies', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('sensitive provider detail', { status: 403 });
  try {
    const result = await verifyProviderCredential('github', { token: 'test-token' });
    assert.deepEqual(result, {
      status: 'verification_failed',
      code: 'HTTP_403',
      message: 'The provider rejected the credential or the required permissions are missing.',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('custom MCP credentials are reported as configured, not externally verified', async () => {
  const result = await verifyProviderCredential('custom_mcp', { endpoint_url: 'https://mcp.example.com' });
  assert.equal(result.status, 'configured');
});
