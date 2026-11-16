import type { Metadata } from 'next';
import { PromptFirstLanding } from '@/components/PromptFirstLanding';
import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, SITE_TITLE } from '@/lib/seo';

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION, url: SITE_ORIGIN + '/' },
  twitter: { card: 'summary', title: SITE_TITLE, description: SITE_DESCRIPTION },
};

export default function Home() { return <PromptFirstLanding />; }
