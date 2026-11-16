import { LEOAppShell } from '@/components/LEOAppShell';
import { ReleaseReadinessDashboard } from '@/components/ReleaseReadinessDashboard';

export const metadata = { title: 'Release Readiness | LeonardX' };

export default function ReleaseReadinessPage() {
  return <LEOAppShell title="Release readiness" subtitle="Owner-only verification workspace for the LeonardX production handoff.">
    <ReleaseReadinessDashboard />
  </LEOAppShell>;
}
