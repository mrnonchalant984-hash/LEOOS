import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, Headers as UndiciHeaders, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import ipaddr from 'ipaddr.js';

const MAX_MCP_RESPONSE_BYTES = 2 * 1024 * 1024;
const MCP_REQUEST_TIMEOUT_MS = 15_000;
type ResolvedAddress = { address: string; family: number };

function allowedHosts(input = process.env.MCP_OUTBOUND_ALLOWED_HOSTS || '') {
  return new Set(input.split(',').map(host => host.trim().toLowerCase()).filter(Boolean));
}

export function validateMcpEndpointUrl(endpoint: string, allowlist = allowedHosts()) {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('Enter a valid absolute MCP endpoint URL.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'chatgpt.com' || hostname.endsWith('.chatgpt.com') ||
      hostname === 'claude.ai' || hostname.endsWith('.claude.ai')) {
    throw new Error('This is an AI assistant website, not an MCP server. To connect LeonardX to ChatGPT or Claude, add LeonardX’s /mcp endpoint in that assistant’s connector settings.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.port && parsed.port !== '443' || isIP(hostname.replace(/^\[|\]$/g, '')) ||
      !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(hostname) ||
      !allowlist.has(hostname)) {
    throw new Error('MCP endpoints must use HTTPS on an operator-allowlisted public hostname, without credentials, query, or fragment.');
  }
  return parsed;
}

async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => {
    try {
      return ipaddr.parse(address).range() !== 'unicast';
    } catch {
      return true;
    }
  })) {
    throw new Error('The MCP endpoint hostname resolved to a non-public network address.');
  }
  return addresses;
}

function pinnedLookup(hostname: string, addresses: ResolvedAddress[]): LookupFunction {
  return (requestedHost, options, callback) => {
    if (requestedHost.toLowerCase() !== hostname) {
      callback(Object.assign(new Error('Unexpected outbound MCP hostname.'), { code: 'EACCES' }), '', 0);
      return;
    }
    const family = options.family || 0;
    const eligible = addresses.filter(address => !family || address.family === family);
    const selected = eligible[0];
    if (!selected) {
      callback(Object.assign(new Error('The allowed MCP hostname has no address for the requested family.'), { code: 'ENOTFOUND' }), '', 0);
      return;
    }
    if (options.all) callback(null, eligible);
    else callback(null, selected.address, selected.family);
  };
}

async function closeDispatcher(dispatcher: Agent, destroy = false) {
  if (destroy) await dispatcher.destroy();
  else await dispatcher.close();
}

export function createSafeMcpFetch(endpoint: string, bearerToken?: string) {
  const approvedEndpoint = validateMcpEndpointUrl(endpoint);
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = new URL(input instanceof Request ? input.url : input.toString());
    if (target.origin !== approvedEndpoint.origin || target.pathname !== approvedEndpoint.pathname ||
        target.search !== approvedEndpoint.search || target.hash || target.username || target.password) {
      throw new Error('Outbound MCP request escaped its registered endpoint.');
    }
    const addresses = await resolvePublicAddresses(approvedEndpoint.hostname);
    const dispatcher = new Agent({
      connect: {
        lookup: pinnedLookup(approvedEndpoint.hostname, addresses),
        maxCachedSessions: 0,
      },
      headersTimeout: MCP_REQUEST_TIMEOUT_MS,
      bodyTimeout: MCP_REQUEST_TIMEOUT_MS,
      maxResponseSize: MAX_MCP_RESPONSE_BYTES,
      pipelining: 0,
      maxOrigins: 1,
    });
    const inputHeaders = new globalThis.Headers(init?.headers);
    const headers = new UndiciHeaders();
    inputHeaders.forEach((value, key) => headers.set(key, value));
    headers.delete('Authorization');
    if (bearerToken) headers.set('Authorization', `Bearer ${bearerToken}`);
    if (init?.body != null && typeof init.body !== 'string') {
      await closeDispatcher(dispatcher, true);
      throw new Error('Outbound MCP requests must use a JSON text body.');
    }
    const requestInit: UndiciRequestInit = {
      method: init?.method,
      headers,
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
      redirect: 'error',
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(MCP_REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(MCP_REQUEST_TIMEOUT_MS),
      dispatcher,
    };
    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(target, requestInit);
    } catch (error) {
      await closeDispatcher(dispatcher, true);
      throw error;
    }
    const responseHeaders = new globalThis.Headers();
    response.headers.forEach((value, key) => responseHeaders.set(key, value));
    if (!response.body) {
      await closeDispatcher(dispatcher);
      return new globalThis.Response(null, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    }

    const reader = response.body.getReader();
    let totalBytes = 0;
    const boundedBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            await closeDispatcher(dispatcher);
            controller.close();
            return;
          }
          totalBytes += value.byteLength;
          if (totalBytes > MAX_MCP_RESPONSE_BYTES) {
            await reader.cancel();
            await closeDispatcher(dispatcher, true);
            controller.error(new Error('The MCP server response exceeded the allowed size.'));
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          await closeDispatcher(dispatcher, true);
          controller.error(error);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason);
        await closeDispatcher(dispatcher, true);
      },
    });
    return new globalThis.Response(boundedBody, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  };
}

function credentialKey() {
  const configured = process.env.MCP_CREDENTIAL_ENCRYPTION_KEY || '';
  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(configured)) key = Buffer.from(configured, 'hex');
  else {
    try {
      key = Buffer.from(configured, 'base64');
    } catch {
      throw new Error('MCP_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hexadecimal key.');
    }
  }
  if (key.length !== 32) throw new Error('MCP_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hexadecimal key.');
  return key;
}

export function encryptMcpCredential(secret: string) {
  if (!secret || secret.length > 8192) throw new Error('MCP bearer credentials must be between 1 and 8,192 characters.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptMcpCredential(ciphertext: string) {
  const parts = ciphertext.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Stored MCP credential has an unsupported encryption format.');
  const decipher = createDecipheriv('aes-256-gcm', credentialKey(), Buffer.from(parts[1], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
