import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { LEOAppShell } from '@/components/LEOAppShell';
import { AgentStudio } from '@/components/developers/AgentStudio';

export const dynamic = 'force-dynamic';

export default function DeveloperAgentsPage() {
  return <LEOAppShell title="Developer Agent Studio" subtitle="Create private custom agents and safely attach approved read-only tools.">
    <div className="mb-5"><Link href="/developers" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white"><ArrowLeft size={14}/> Back to Developer Platform</Link></div>
    <div className="page-hero">
      <span className="mini-label">Paid Developer API plans</span>
      <h2>Build your own specialized agents.</h2>
      <p>Define private agent instructions and attach tools already connected and approved on your account. Tool access is read-only and checked again when Leo runs the agent.</p>
    </div>
    <AgentStudio />
  </LEOAppShell>;
}
