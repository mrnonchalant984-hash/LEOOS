'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Code2, FileText, GraduationCap, Play, Search, Sparkles, Terminal, Wrench } from 'lucide-react';

const resources = [
  { id:'docs', kind:'Docs', title:'Product documentation', desc:'Understand Leo, projects, deployments, integrations and the platform lifecycle.', href:'/docs', icon:BookOpen, tags:['Platform','Product'], accent:'core' },
  { id:'tutorials', kind:'Tutorials', title:'Build with Leo', desc:'Practical, step-by-step paths from an idea to a tested and deployed project.', href:'/tutorials', icon:GraduationCap, tags:['Learn','Build'], accent:'learn' },
  { id:'api', kind:'Developer', title:'API reference', desc:'Explore the developer surface, authentication, scopes and request conventions.', href:'/docs/api', icon:Code2, tags:['API','Developers'], accent:'dev' },
  { id:'sdk', kind:'Developer', title:'SDK guide', desc:'Typed client patterns for applications that integrate with LEO OS.', href:'/docs/sdk', icon:Terminal, tags:['SDK','Developers'], accent:'dev' },
  { id:'templates', kind:'Library', title:'Template library', desc:'Browse real starting directions for business sites, apps and product experiences.', href:'/templates', icon:Sparkles, tags:['Templates','Design'], accent:'build' },
  { id:'whats-new', kind:'Updates', title:"What's new", desc:'Follow published product changes and platform improvements.', href:'/whats-new', icon:Wrench, tags:['Updates','Product'], accent:'core' },
  { id:'blog', kind:'Writing', title:'Leo Journal', desc:'Long-form thinking about AI-assisted software creation and practical development.', href:'/blog', icon:FileText, tags:['Insights','AI'], accent:'learn' },
  { id:'support', kind:'Help', title:'Support', desc:'Find the right path when you need product help or have a platform question.', href:'/support', icon:Play, tags:['Help','Support'], accent:'core' },
] as const;

export function ResourceExplorer(){
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('All');
  const kinds=['All',...Array.from(new Set(resources.map(r=>r.kind)))];
  const filtered=useMemo(()=>resources.filter(r=>{
    const text=`${r.title} ${r.desc} ${r.tags.join(' ')}`.toLowerCase();
    return (filter==='All'||r.kind===filter) && text.includes(query.toLowerCase());
  }),[query,filter]);
  return <div className="hub-shell">
    <div className="hub-toolbar">
      <label className="hub-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search resources, APIs, tutorials…" aria-label="Search resources"/><kbd>/</kbd></label>
      <div className="hub-filters" role="tablist" aria-label="Resource categories">{kinds.map(k=><button key={k} onClick={()=>setFilter(k)} className={filter===k?'active':''}>{k}</button>)}</div>
    </div>
    <div className="hub-count"><span>{filtered.length} resources</span><span>{query||filter!=='All'?`Filtered by ${filter==='All'?'search':filter}`:'Curated for building with Leo'}</span></div>
    <div className="hub-grid">{filtered.map(r=>{const Icon=r.icon;return <Link key={r.id} href={r.href} className={`hub-card hub-${r.accent}`}><div className="hub-card-top"><span className="hub-icon"><Icon size={18}/></span><span>{r.kind}</span><ArrowUpRight size={15}/></div><h2>{r.title}</h2><p>{r.desc}</p><div className="hub-tags">{r.tags.map(t=><span key={t}>{t}</span>)}</div></Link>})}</div>
    {filtered.length===0&&<div className="hub-empty"><Sparkles size={20}/><h2>No matching resources</h2><p>Try a broader search or switch the category.</p></div>}
  </div>
}
