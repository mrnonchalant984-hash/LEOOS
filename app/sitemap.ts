import type { MetadataRoute } from 'next';

const SITE_URL = 'https://leoos-omega.vercel.app';
const pages: Array<{ path: string; priority: number; frequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/', priority: 1, frequency: 'weekly' },
  { path: '/pricing', priority: 0.9, frequency: 'weekly' },
  { path: '/leo-ai', priority: 0.9, frequency: 'weekly' },
  { path: '/developers', priority: 0.85, frequency: 'weekly' },
  { path: '/developers/docs', priority: 0.8, frequency: 'weekly' },
  { path: '/developers/pricing', priority: 0.75, frequency: 'weekly' },
  { path: '/docs', priority: 0.8, frequency: 'weekly' },
  { path: '/cli', priority: 0.7, frequency: 'monthly' },
  { path: '/integrations', priority: 0.75, frequency: 'monthly' },
  { path: '/templates', priority: 0.8, frequency: 'weekly' },
  { path: '/tutorials', priority: 0.75, frequency: 'weekly' },
  { path: '/resources', priority: 0.7, frequency: 'weekly' },
  { path: '/workflows', priority: 0.7, frequency: 'monthly' },
  { path: '/webhooks', priority: 0.65, frequency: 'monthly' },
  { path: '/about', priority: 0.6, frequency: 'monthly' },
  { path: '/contact', priority: 0.6, frequency: 'monthly' },
  { path: '/portfolio', priority: 0.6, frequency: 'monthly' },
  { path: '/blog', priority: 0.85, frequency: 'weekly' },
  { path: '/blog/freelancers-ai-10x', priority: 0.75, frequency: 'monthly' },
  { path: '/blog/leo-vs-chatgpt', priority: 0.75, frequency: 'monthly' },
  { path: '/blog/build-website-10-minutes-5000', priority: 0.75, frequency: 'monthly' },
  { path: '/terms', priority: 0.3, frequency: 'yearly' },
  { path: '/privacy', priority: 0.3, frequency: 'yearly' },
  { path: '/refund-policy', priority: 0.3, frequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map(({ path, priority, frequency }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: frequency,
    priority,
  }));
}
