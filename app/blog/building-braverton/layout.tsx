import { createPublicMetadata } from '@/lib/seo';

export const metadata = createPublicMetadata({
  title: 'Building Braverton in Public',
  description: 'Follow Braverton’s public build log: product decisions, engineering changes, verification results and lessons learned.',
  path: '/blog/building-braverton',
  type: 'article',
});

export default function BuildingBravertonLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
