import type {MetadataRoute} from 'next';

function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) {
    const normalized = configured.trim().replace(/\/$/, '');
    return /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
  }
  return process.env.NODE_ENV === 'production' ? 'https://leoos-omega.vercel.app' : 'http://localhost:3000';
}

export default function sitemap():MetadataRoute.Sitemap{const base=getBaseUrl();const paths=['/','/pricing','/leo-ai','/about','/contact','/portfolio','/audit','/wall-of-love','/blog','/terms','/privacy','/refund-policy','/setup','/setup/keys','/payment/hosting-renewal','/dashboard','/admin','/blog/freelancers-ai-10x','/blog/leo-vs-chatgpt','/blog/build-website-10-minutes-5000'];return paths.map(path=>({url:`${base}${path}`,lastModified:new Date()}));}