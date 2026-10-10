import { isIP } from 'node:net';

export class PublicSiteFetchError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'PublicSiteFetchError';
    this.statusCode = statusCode;
  }
}

export function validatePublicSiteUrl(raw: string): URL {
  if (raw.length > 2048) throw new PublicSiteFetchError('The URL is too long.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublicSiteFetchError('Enter a valid website URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) throw new PublicSiteFetchError('Only HTTP and HTTPS websites are supported.');
  if (url.username || url.password) throw new PublicSiteFetchError('URLs containing credentials are not allowed.');
  if (url.port && !(url.protocol === 'http:' && url.port === '80') && !(url.protocol === 'https:' && url.port === '443')) {
    throw new PublicSiteFetchError('Custom ports are not supported.');
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(hostname) || !hostname.includes('.') || /\.(localhost|local|internal|lan|home)$/.test(hostname)) {
    throw new PublicSiteFetchError('Only publicly named websites can be audited.');
  }

  url.hash = '';
  return url;
}
