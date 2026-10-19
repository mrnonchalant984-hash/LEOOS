import type { Metadata } from 'next';

export const SITE_ORIGIN = 'https://leoos-omega.vercel.app';
export const SITE_NAME = 'LeonardX';
export const SITE_TITLE = 'LeonardX — AI Website, App & Software Development';
export const SITE_DESCRIPTION =
  'Build websites, web apps and software with LeonardX. Explore AI-assisted development, project workspaces, developer tools and deployment workflows.';
export const SOCIAL_IMAGE_PATH = '/leonardx-og.png';
export const SOCIAL_IMAGE_ALT = 'LeonardX AI software development workspace';

type PublicMetadataOptions = {
  title: string;
  description: string;
  path: string;
  type?: 'website' | 'article';
};

export function createPublicMetadata({
  title,
  description,
  path,
  type = 'website',
}: PublicMetadataOptions): Metadata {
  const fullTitle = `${title} | ${SITE_NAME}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url: path,
      images: [{
        url: SOCIAL_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: SOCIAL_IMAGE_ALT,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [SOCIAL_IMAGE_PATH],
    },
  };
}

export function createNoIndexMetadata(): Metadata {
  return { robots: { index: false, follow: false, noarchive: true } };
}

export function serializeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
