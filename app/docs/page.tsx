'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Bot, Code2, CreditCard, GitBranch, Search, ShieldCheck, Users, Zap } from 'lucide-react';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
const docs=[
 ['Getting started','Understand the LEO OS workflow and create your first project.','/setup',BookOpen,'Start here'],
 ['Leo','Use Leo as the intelligence and execution layer.','/app',Bot,'Core'],
 ['Projects','Build websites, web apps and SaaS in project workspaces.','/projects',GitBranch,'Build'],
 ['Developer API','Use API v1, authentication, scopes and request handling.','/docs/api',Code2,'Developer'],
 ['Security','Understand ownership, permissions and platform boundaries.','/account',ShieldCheck,'Trust'],
 ['Teams','Collaborate with organization roles and shared projects.','/team',Users,'Collaboration'],
 ['Billing','Plans, Paystack, credits and hosting lifecycle.','/pricing',CreditCard,'Account'],
 ['Deployments','Read deployment states, history and verification.','/deployments',Zap,'Ship'],
] as const;
export default function Docs(){const [q,setQ]=useState('');const [tab,setTab]=useState('All');const tabs=['All','Start here','Core','Build','Developer','Trust','Collaboration','Account','Ship'];const filtered=useMemo(()=>docs.filter(d=>`${d[0]} ${d[1]} ${d[4]}`.toLowerCase().includes(q.toLowerCase())&&(tab==='All'||d[4]===tab)),[q,tab]);return <LEOAppShell title="Documentation" subtitle="Product, developer and operational documentation."><div className="docs-hero"><div><span className="mini-label">LEONARD X KNOWLEDGE</span><h2>Documentation that moves with the product.</h2><p>Find the shortest path from a question to the right workspace. Provider-dependent capabilities are explicitly marked rather than presented as completed features.</p></div><div className="docs-signal"><span>IDEA</span><i>→</i><span>LEO</span><i>→</i><span>BUILD</span><i>→</i><span>TEST</span><i>→</i><span>DEPLOY</span></div></div><div className="docs-tools"><label><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search documentation…"/><kbd>/</kbd></label><div>{tabs.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</div></div><div className="docs-layout"><aside className="docs-index"><span>QUICK PATHS</span><Link href="/setup">Create a project <ArrowRight size={13}/></Link><Link href="/tutorials">Follow a tutorial <ArrowRight size={13}/></Link><Link href="/resources">Browse resources <ArrowRight size={13}/></Link><Link href="/developers">Developer platform <ArrowRight size={13}/></Link></aside><div className="docs-grid">{filtered.map(([title,desc,href,Icon,group])=><Link href={href} key={title} className="doc-card"><div className="doc-card-top"><span><Icon size={17}/></span><small>{group}</small><ArrowRight size={14}/></div><h3>{title}</h3><p>{desc}</p><div className="doc-progress"><i/><small>Explore section</small></div></Link>)}</div></div>{filtered.length===0&&<Panel className="mt-4"><p className="text-zinc-400">No documentation matches that search.</p></Panel>}</LEOAppShell>}
