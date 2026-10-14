import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Webhooks — Developer Integration Guide',
  description: 'Learn about LeonardX webhook events, delivery behavior and integration patterns for developer workflows.',
  alternates: { canonical: '/webhooks' },
  openGraph: { title: 'Webhooks — Developer Integration Guide', description: 'Learn about LeonardX webhook events, delivery behavior and integration patterns for developer workflows.', url: '/webhooks', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Webhooks — Developer Integration Guide', description: 'Learn about LeonardX webhook events, delivery behavior and integration patterns for developer workflows.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
