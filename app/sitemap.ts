import type { MetadataRoute } from 'next';
import { big12Projects } from '@/data/site';
import { LEO_TEMPLATES } from '@/data/website-templates';
import { SITE_ORIGIN } from '@/lib/seo';

type SitemapPage = {
  path: string;
  priority: number;
  changeFrequency: 'weekly' | 'monthly' | 'yearly';
};

const publicPages: SitemapPage[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/leo-ai', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/services', priority: 0.85, changeFrequency: 'monthly' },
  { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/developers', priority: 0.85, changeFrequency: 'monthly' },
  { path: '/developers/docs', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/developers/pricing', priority: 0.75, changeFrequency: 'monthly' },
  { path: '/docs', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/docs/api', priority: 0.75, changeFrequency: 'monthly' },
  { path: '/docs/sdk', priority: 0.75, changeFrequency: 'monthly' },
  { path: '/cli', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/integrations', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/templates', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/tutorials', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/resources', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/webhooks', priority: 0.65, changeFrequency: 'monthly' },
  { path: '/plugins', priority: 0.55, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/support', priority: 0.55, changeFrequency: 'yearly' },
  { path: '/blog', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/blog/freelancers-ai-10x', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/blog/leo-vs-chatgpt', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/blog/build-website-10-minutes-5000', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/projects', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/team', priority: 0.55, changeFrequency: 'yearly' },
  { path: '/wall-of-love', priority: 0.55, changeFrequency: 'monthly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/refund-policy', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    ...publicPages,
    ...LEO_TEMPLATES.map(({ id }): SitemapPage => ({
      path: `/templates/${id}`,
      priority: 0.55,
      changeFrequency: 'monthly',
    })),
    ...big12Projects.map(({ id }): SitemapPage => ({
      path: `/projects/${id}`,
      priority: 0.55,
      changeFrequency: 'monthly',
    })),
  ];

  return pages.map(({ path, ...page }) => ({
    url: `${SITE_ORIGIN}${path === '/' ? '/' : path}`,
    ...page,
  }));
}
