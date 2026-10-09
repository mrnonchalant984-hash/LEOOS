/** Next.js configuration for LEO Portfolio OS. */
/** @type {import('next').NextConfig} */
function createReportOnlyCsp() {
  const connectSources = ["'self'", 'https://api.openai.com'];
  const imageSources = [
    "'self'",
    'data:',
    'blob:',
    'https://source.unsplash.com',
    'https://images.unsplash.com',
  ];

  // Supabase's URL is public configuration. Use its exact host so auth and data
  // requests stay available without allowing arbitrary HTTPS destinations.
  try {
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    if (supabaseUrl.protocol === 'https:' || supabaseUrl.protocol === 'http:') {
      connectSources.push(supabaseUrl.origin);
      connectSources.push(
        `${supabaseUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${supabaseUrl.host}`,
      );
      imageSources.push(supabaseUrl.origin);
    }
  } catch {
    // Keep the optional Supabase origin out of the policy when it is not configured.
  }

  // Keep CSP report-only until production browser reports are reviewed. Trusted
  // Types is intentionally omitted until the Next.js bootstrap and chat paths are checked.
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `connect-src ${connectSources.join(' ')}`,
    `img-src ${imageSources.join(' ')}`,
    "font-src 'self' data:",
    "media-src 'self' blob: data:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "frame-src 'self'",
  ].join('; ');
}

const nextConfig = {
  async headers() {
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(self), geolocation=(), payment=(self)',
      },
    ];

    if (process.env.NODE_ENV === 'production') {
      headers.push(
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        {
          key: 'Content-Security-Policy-Report-Only',
          value: createReportOnlyCsp(),
        },
      );
    }

    return [
      {
        source: '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
        headers,
      },
    ];
  },
  async redirects() {
    return [
      { source: '/blog/nigerian-freelancers-ai-10x', destination: '/blog/freelancers-ai-10x', permanent: true },
      { source: '/blog/leo-vs-chatgpt-nigeria', destination: '/blog/leo-vs-chatgpt', permanent: true },
    ];
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'source.unsplash.com' }, { protocol: 'https', hostname: 'images.unsplash.com' }, { protocol: 'https', hostname: 'localhost' }] },
};
module.exports = nextConfig;
