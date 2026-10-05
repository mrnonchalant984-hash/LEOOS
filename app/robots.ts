import type { MetadataRoute } from 'next';

function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) {
    const normalized = configured.trim().replace(/\/$/, '');
    return /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
  }
  return process.env.NODE_ENV === 'production' ? 'https://leoos-omega.vercel.app' : 'http://localhost:3000';
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/dashboard', '/account', '/auth'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
