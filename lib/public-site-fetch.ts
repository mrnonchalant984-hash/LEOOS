import { lookup } from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import type { RequestOptions as HttpRequestOptions } from 'node:http';
import { isPrivateIp } from '@/lib/webhooks-core';
import { PublicSiteFetchError, validatePublicSiteUrl } from '@/lib/public-site-url';

export { PublicSiteFetchError, validatePublicSiteUrl } from '@/lib/public-site-url';

const MAX_HTML_BYTES = 800_000;
const MAX_REDIRECTS = 3;
const MAX_FETCH_MS = 12_000;

type PinnedAddress = { address: string; family: 4 | 6 };
type FetchResult = { status: number; headers: http.IncomingHttpHeaders; html: string; location?: string };

async function resolvePublicAddress(url: URL, deadline: number): Promise<PinnedAddress> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new PublicSiteFetchError('The website did not respond in time.', 504);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PublicSiteFetchError('The website did not respond in time.', 504)), remaining);
      }),
    ]);
    if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
      throw new PublicSiteFetchError('The website resolves to a non-public network address.');
    }
    return { address: addresses[0].address, family: addresses[0].family as 4 | 6 };
  } catch (error) {
    if (error instanceof PublicSiteFetchError) throw error;
    throw new PublicSiteFetchError('The website host could not be resolved.', 502);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestPinned(url: URL, address: PinnedAddress, timeoutMs: number): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const pinnedLookup: NonNullable<HttpRequestOptions['lookup']> = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address: address.address, family: address.family }]);
      else callback(null, address.address, address.family);
    };
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, {
      method: 'GET',
      lookup: pinnedLookup,
      maxHeaderSize: 16_384,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'identity',
        'User-Agent': 'LEO-Website-Auditor/1.0',
        Connection: 'close',
      },
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        resolve({ status, headers: response.headers, html: '', location });
        return;
      }

      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
        request.destroy(new PublicSiteFetchError('The website response is too large.', 413));
        return;
      }
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        request.destroy(new PublicSiteFetchError('Compressed website responses are not supported.', 415));
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > MAX_HTML_BYTES) {
          request.destroy(new PublicSiteFetchError('The website response is too large.', 413));
          return;
        }
        chunks.push(buffer);
      });
      response.on('end', () => resolve({ status, headers: response.headers, html: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });

    request.setTimeout(timeoutMs, () => request.destroy(new PublicSiteFetchError('The website did not respond in time.', 504)));
    request.on('error', reject);
    request.end();
  });
}

export async function fetchPublicHtml(rawUrl: string) {
  let url = validatePublicSiteUrl(rawUrl);
  const deadline = Date.now() + MAX_FETCH_MS;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const address = await resolvePublicAddress(url, deadline);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new PublicSiteFetchError('The website did not respond in time.', 504);
    const result = await requestPinned(url, address, remaining);
    if (!result.location) {
      const contentType = result.headers['content-type'];
      if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new PublicSiteFetchError('The URL did not return an HTML page.', 415);
      }
      return { ...result, url: url.toString() };
    }

    if (redirectCount === MAX_REDIRECTS) throw new PublicSiteFetchError('The website redirected too many times.', 400);
    const redirected = validatePublicSiteUrl(new URL(result.location, url).toString());
    if (url.protocol === 'https:' && redirected.protocol !== 'https:') {
      throw new PublicSiteFetchError('HTTPS websites cannot redirect to an insecure HTTP URL.');
    }
    url = redirected;
  }

  throw new PublicSiteFetchError('The website could not be loaded.', 502);
}
