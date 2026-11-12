import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/store/account',
        '/store/admin',
        '/store/messages',
        '/store/saved',
        '/store/seller/',
      ],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
