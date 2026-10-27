import { Suspense } from 'react';
import { AppWorkspaceEntry } from '@/components/AppWorkspaceEntry';

export const metadata = { title: 'LEO AI — General AI Assistant' };

export default function AppPage() {
  return <main className="min-h-screen overflow-hidden bg-[#0b0b0b]"><Suspense fallback={<div className="min-h-screen bg-[#0b0b0b]" aria-label="Loading Leo workspace" />}><AppWorkspaceEntry /></Suspense></main>;
}
