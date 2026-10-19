import { createPublicMetadata } from '@/lib/seo';

export const metadata = createPublicMetadata({
  title: 'Plugin Registry',
  description: 'Learn how LeonardX validates plugin manifests, publishes trusted metadata and protects runtime calls with authenticated permissions.',
  path: '/plugins',
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
