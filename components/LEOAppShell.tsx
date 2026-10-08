'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Bot, Boxes, Code2, Command, CreditCard, FolderKanban, Gauge, GitBranch, Globe2, KeyRound, LayoutDashboard, LifeBuoy, Menu, Network, Settings, ShieldCheck, Sparkles, Users, Webhook, X } from 'lucide-react';
import { useState } from 'react';

const groups = [
  { label: 'Workspace', items: [['Home','/dashboard',LayoutDashboard],['Leo','/app',Bot],['Projects','/projects',FolderKanban],['Agents','/agents',Boxes]] as const },
  { label: 'Ship', items: [['Deployments','/deployments',GitBranch],['Integrations','/integrations',Network]] as const },
  { label: 'Platform', items: [['Developers','/developers',Code2],['Teams','/organizations',Users]] as const },
];

export function LEOAppShell({ children, title = 'Leonard X', subtitle = 'AI software workspace' }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <div className="leo-app-shell">
    <aside className={`leo-sidebar ${open ? 'leo-sidebar-open' : ''}`}>
      <div className="leo-brand-row"><Link href="/" className="leo-brand" onClick={() => setOpen(false)}><span className="leo-mark">L</span><span><strong>LEONARD X</strong><small>AI software platform</small></span></Link><button className="icon-button mobile-only" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <button className="command-button" type="button"><Command size={15}/><span>Search workspace</span><kbd>⌘K</kbd></button>
      <nav className="leo-nav" aria-label="LEO OS navigation">
        {groups.map(group => <div className="leo-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(([label, href, Icon]) => { const active = pathname === href || pathname.startsWith(href + '/'); return <Link key={href} href={href} onClick={() => setOpen(false)} className={`leo-nav-item ${active ? 'active' : ''}`}><Icon size={17}/><span>{label}</span>{active && <i/>}</Link> })}</div>)}
      </nav>
      <div className="leo-sidebar-footer"><div className="system-pulse"><span/> <span>All systems operational</span></div><div className="leo-sidebar-footer-actions"><Link href="/docs" className="text-link">Docs</Link><Link href="/support" className="text-link">Support</Link></div></div>
    </aside>
    {open && <button className="mobile-scrim" onClick={() => setOpen(false)} aria-label="Close navigation"/>}
    <section className="leo-app-main">
      <header className="leo-topbar"><button className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={19}/></button><div><p className="eyebrow">LEO OS / WORKSPACE</p><h1>{title}</h1><p>{subtitle}</p></div><div className="topbar-actions"><Link href="/app" className="topbar-leo"><Sparkles size={14}/> Leo</Link><Link href="/account" className="avatar-link">L</Link></div></header>
      <main className="leo-content">{children}</main>
    </section>
  </div>;
}

export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={`leo-panel ${className}`}>{children}</section>; }
export function StatusPill({ status }: { status: string }) { const s = status.toLowerCase().replaceAll(' ', '-'); return <span className={`status-pill status-${s}`}><span/>{status}</span>; }
