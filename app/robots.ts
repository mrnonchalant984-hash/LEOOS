import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/_next/', '/store/account', '/store/admin', '/store/messages', '/store/saved', '/store/seller/'] },
      { userAgent: 'GPTBot', allow: '/', disallow: ['/api/', '/_next/'] },
      { userAgent: 'ClaudeBot', allow: '/', disallow: ['/api/', '/_next/'] },
      { userAgent: 'PerplexityBot', allow: '/', disallow: ['/api/', '/_next/'] },
      { userAgent: 'Googlebot', allow: '/', disallow: ['/api/', '/_next/'] },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
