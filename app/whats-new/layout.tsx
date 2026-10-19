import { createNoIndexMetadata } from '@/lib/seo';

export const metadata = createNoIndexMetadata();

export default function NoIndexLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
