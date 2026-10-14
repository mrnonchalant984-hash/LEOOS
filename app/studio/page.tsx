import type { Metadata } from 'next';
import { LEOAppShell } from '@/components/LEOAppShell';
import StudioWorkspace from '@/components/studio/StudioWorkspace';

export const metadata: Metadata = {
  title: 'AI Transformation Studio — LeonardX',
  description: 'Generate images, edit photographs, and create text-to-video projects with configured LeonardX providers.',
  robots: { index: false, follow: false, noarchive: true },
};

export default function StudioPage() {
  return (
    <LEOAppShell title="AI Studio" subtitle="Create, transform, and manage AI media">
      <StudioWorkspace />
    </LEOAppShell>
  );
}
