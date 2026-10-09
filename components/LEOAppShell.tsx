'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, BarChart3, Bot, Boxes, BookOpen, Code2, CreditCard, Globe2,
  FileText, FolderKanban, Gauge, GitBranch, KeyRound, LayoutDashboard,
  LifeBuoy, Menu, Network, Newspaper, Package, Search, ShieldCheck,
  Users, Webhook, X, Bell, CircleHelp, ChevronDown, Building2,
  ScrollText, UserRound, Wallet, Layers3, TerminalSquare, LockKeyhole, Settings,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type NavItem = readonly [string, string, typeof LayoutDashboard];
const groups: { label: string; items: NavItem[] }[] = [
  { label: 'Workspace', items: [
    ['Overview','/dashboard',LayoutDashboard], ['Projects','/projects',FolderKanban], ['Leo workspace','/app',Bot],
    ['Agents','/agents',Boxes], ['Deployments','/deployments',GitBranch], ['Analytics','/analytics',BarChart3],
    ['Observability','/observability',Activity], ['System status','/status',Gauge],
  ] },
  { label: 'Developer platform', items: [
    ['Developers','/developers',Code2], ['API keys','/api-keys',KeyRound], ['Webhooks','/webhooks',Webhook],
    ['Integrations','/integrations',Network], ['Documentation','/docs',BookOpen], ['API reference','/docs/api',FileText],
    ['SDK','/docs/sdk',TerminalSquare], ['Organizations','/organizations',Building2],
  ] },
  { label: 'Explore', items: [
    ['Marketplace / templates','/templates',Package], ['Resources','/resources',Layers3], ['Tutorials','/tutorials',BookOpen], ['Leo overview','/leo-ai',Bot],
    ['What’s new','/whats-new',Newspaper], ['Blog','/blog',FileText],
  ] },
  { label: 'Account', items: [
    ['Account settings','/account',UserRound], ['Notifications','/notifications',Bell], ['Pricing & plans','/pricing',Wallet],
    ['Support','/support',LifeBuoy], ['Payment history','/payment/manual',CreditCard], ['Website checkout','/payment/website',Globe2], ['Hosting renewal','/payment/hosting-renewal',Wallet],
  ] },
];
const adminGroup: { label: string; items: NavItem[] } = { label: 'Administration', items: [
  ['Admin overview','/admin',ShieldCheck], ['Leo training','/admin/leo/training',Bot], ['Agent management','/admin/agents',Boxes],
  ['Announcements','/admin/announcements',Bell], ['Upgrade history','/admin/upgrade-history',ScrollText], ['Audit log','/audit',LockKeyhole],
] };
const publicGroup: { label: string; items: NavItem[] } = { label: 'Public site', items: [
  ['Home','/',LayoutDashboard], ['About','/about',Users], ['Contact','/contact',LifeBuoy], ['Portfolio','/portfolio',Boxes], ['Team','/team',Users],
  ['Testimonials','/wall-of-love',Users], ['Terms','/terms',FileText],
  ['Privacy','/privacy',ShieldCheck], ['Refund policy','/refund-policy',CreditCard], ['Setup','/setup',Settings], ['Setup keys','/setup/keys',KeyRound],
] };
const publicDestinations = publicGroup.items.map(([label, href]) => [label, href] as const);

type Destination = { label: string; href: string; group: string };

export function LEOAppShell({ children, title = 'LeonardX', subtitle = 'Your software workspace' }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem('leonardx-sidebar-collapsed') === '1'); } catch { /* preference storage is optional */ }
    let alive = true;
    fetch('/api/auth/me', { cache: 'no-store' }).then(async r => r.ok ? r.json() : null).then(data => {
      if (!alive) return;
      setIsOwner(data?.isPlatformOwner === true);
    }).catch(() => { if (alive) setIsOwner(false); });
    return () => { alive = false; };
  }, []);

  const destinations = useMemo<Destination[]>(() => [
    ...groups.flatMap(group => group.items.map(([label, href]) => ({ label, href, group: group.label }))),
    ...publicGroup.items.map(([label, href]) => ({ label, href, group: publicGroup.label })),
    ...(isOwner ? adminGroup.items.map(([label, href]) => ({ label, href, group: adminGroup.label })) : []),
    ...publicDestinations.map(([label, href]) => ({ label, href, group: 'Public pages' })),
  ].filter((item, index, all) => all.findIndex(other => other.href === item.href && other.label === item.label) === index), [isOwner]);
  const results = destinations.filter(item => `${item.label} ${item.href} ${item.group}`.toLowerCase().includes(query.toLowerCase())).slice(0, 12);

  const toggleCollapsed = useCallback(() => setCollapsed(previous => {
    const next = !previous;
    try { window.localStorage.setItem('leonardx-sidebar-collapsed', next ? '1' : '0'); } catch { /* optional */ }
    return next;
  }), []);
  const openPalette = useCallback(() => { setPaletteOpen(true); setQuery(''); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); }
      if (event.key === 'Escape') { setPaletteOpen(false); setOpen(false); setProfileOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette]);
  const navigate = (href: string) => { setPaletteOpen(false); setOpen(false); router.push(href); };

  return <div className={`leo-app-shell ${collapsed ? 'leo-app-shell-collapsed' : ''}`}>
    <aside className={`leo-sidebar ${open ? 'leo-sidebar-open' : ''} ${collapsed ? 'leo-sidebar-collapsed' : ''}`}>
      <div className="leo-brand-row">
        <Link href="/" className="leo-brand" aria-label="LeonardX home" onClick={() => setOpen(false)}>
          <span className="leo-mark">LX</span><span className="leo-brand-copy"><strong>LEONARDX</strong><small>SOFTWARE PLATFORM</small></span>
        </Link>
        <button className="icon-button mobile-only" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18}/></button>
      </div>
      <button className="command-button" type="button" onClick={openPalette} title="Search pages and actions"><Search size={15}/><span className="sidebar-label">Search workspace</span><kbd>Ctrl K</kbd></button>
      <nav className="leo-nav" aria-label="LeonardX application navigation">
        {[...groups, publicGroup, ...(isOwner ? [adminGroup] : [])].map(group => <div className="leo-nav-group" key={group.label}>
          <p className="sidebar-label">{group.label}</p>
          {group.items.map(([label, href, Icon]) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
            return <Link key={`${label}:${href}`} href={href} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)} className={`leo-nav-item ${active ? 'active' : ''}`}><Icon size={17}/><span className="sidebar-label">{label}</span>{active && <i/>}</Link>;
          })}
        </div>)}
      </nav>
      <div className="leo-sidebar-footer">
        <div className="system-pulse"><span className="status-neutral-dot"/><span className="sidebar-label">Platform status</span><b>VIEW</b></div>
        <div className="leo-sidebar-footer-actions"><Link href="/docs" className="text-link">Docs</Link><Link href="/support" className="text-link">Support</Link></div>
        <button className="sidebar-collapse" type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? '→' : '←'} <span className="sidebar-label">Collapse navigation</span></button>
      </div>
    </aside>
    {open && <button className="mobile-scrim" onClick={() => setOpen(false)} aria-label="Close navigation"/>}
    <section className="leo-app-main">
      <header className="leo-topbar">
        <button className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={19}/></button>
        <div className="topbar-page-context"><p className="eyebrow">LEONARDX <span>/</span> WORKSPACE</p><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="topbar-actions">
          <button className="topbar-search" type="button" onClick={openPalette}><Search size={15}/><span>Search anything</span><kbd>Ctrl K</kbd></button>
          <Link href="/notifications" className="icon-button topbar-icon" aria-label="Notifications"><Bell size={16}/></Link>
          <Link href="/support" className="icon-button topbar-icon" aria-label="Help and support"><CircleHelp size={16}/></Link>
          <div className="profile-menu-wrap"><button type="button" className="avatar-link" aria-label="Open account menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(value => !value)}>L<ChevronDown size={12}/></button>{profileOpen && <div className="profile-menu"><Link href="/account" onClick={() => setProfileOpen(false)}>Account settings</Link><Link href="/pricing" onClick={() => setProfileOpen(false)}>Plans and billing</Link><Link href="/auth" onClick={() => setProfileOpen(false)}>Sign in / switch account</Link></div>}</div>
        </div>
      </header>
      <main className="leo-content">{children}</main>
    </section>
    {paletteOpen && <div className="command-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPaletteOpen(false); }}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Search LeonardX" onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); (event.currentTarget.querySelector('.command-result') as HTMLButtonElement | null)?.focus(); } }}><div className="command-palette-search"><Search size={18}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pages, tools, and settings…" aria-label="Search pages and tools"/><kbd>ESC</kbd></div><p className="command-section-label">NAVIGATION</p><div className="command-results">{results.map(item => <button className="command-result" key={`${item.label}:${item.href}`} onClick={() => navigate(item.href)}><span><small>{item.group}</small><strong>{item.label}</strong></span><code>{item.href}</code></button>)}{results.length === 0 && <div className="command-no-results">No matching pages. Try another search.</div>}</div><footer><span><kbd>↵</kbd> Open page</span><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>Esc</kbd> Close</span></footer></section></div>}
  </div>;
}

export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={`leo-panel ${className}`}>{children}</section>; }
export function StatusPill({ status }: { status: string }) { const s = status.toLowerCase().replaceAll(' ', '-'); return <span className={`status-pill status-${s}`}><span/>{status}</span>; }
