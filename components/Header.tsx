'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ArrowRight, Search } from 'lucide-react';

const links = [['Product','/'],['Leo AI','/leo-ai'],['Developers','/developers'],['Resources','/resources'],['Pricing','/pricing'],['Company','/about']] as const;
const appPrefixes = ['/dashboard','/app','/projects','/agents','/deployments','/analytics','/api-keys','/audit','/auth','/account','/admin','/developers','/docs','/integrations','/leo-ai','/notifications','/observability','/organizations','/resources','/setup','/support','/status','/team','/templates','/tutorials','/webhooks','/whats-new'];
export function Header(){
  const [open,setOpen]=useState(false); const pathname=usePathname();
  if (appPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
  return <header className="public-header"><div className="public-header-inner"><Link href="/" className="public-brand"><span className="public-mark">LX</span><span>LEONARDX</span></Link><nav className="public-nav" aria-label="Main navigation">{links.map(([label,href])=><Link key={href} href={href}>{label}</Link>)}</nav><div className="public-actions"><Link href="/docs" className="public-search" aria-label="Search documentation" title="Search documentation"><Search size={16}/></Link><Link href="/auth" className="public-sign-in">Sign in</Link><Link href="/app" className="get-started">Start building <ArrowRight size={13}/></Link><button type="button" onClick={()=>setOpen(!open)} aria-label={open?'Close navigation':'Open navigation'} className="menu-button">{open?<X size={17}/>:<Menu size={17}/>}</button></div></div>{open&&<nav className="mobile-public-nav" aria-label="Mobile navigation">{links.map(([label,href])=><Link key={href} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}<div><Link href="/auth" onClick={()=>setOpen(false)} className="mobile-primary">Sign in</Link><Link href="/app" onClick={()=>setOpen(false)} className="mobile-primary">Start building <ArrowRight size={13}/></Link></div></nav>}</header>
}
