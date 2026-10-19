import type { Metadata } from 'next';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata();

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
