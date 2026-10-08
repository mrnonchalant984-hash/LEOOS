'use client';
import {useEffect,useState} from 'react';
import {BarChart3,Bot,Coins,FolderKanban,Globe2, type LucideIcon} from 'lucide-react';
import {LEOAppShell,Panel} from '@/components/LEOAppShell';

type D={counts:{projects:number;websites:number;conversations:number};usageTrend:{date:string;tokens:number}[]};
type Metric={label:string;value:string|number;icon:LucideIcon};

export default function Analytics(){
  const[d,setD]=useState<D|null>(null);
  useEffect(()=>{
    fetch('/api/dashboard',{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(setD);
  },[]);
  const total=(d?.usageTrend||[]).reduce((a,b)=>a+b.tokens,0);
  const metrics:Metric[]=[
    {label:'Projects',value:d?.counts.projects??'—',icon:FolderKanban},
    {label:'Websites',value:d?.counts.websites??'—',icon:Globe2},
    {label:'Leo conversations',value:d?.counts.conversations??'—',icon:Bot},
    {label:'Tracked tokens',value:total?total.toLocaleString():'—',icon:Coins},
  ];
  const maxTokens=Math.max(1,...(d?.usageTrend||[]).map(x=>x.tokens));
  return <LEOAppShell title="Analytics" subtitle="Account activity derived from real LEO OS data.">
    <div className="page-hero"><span className="mini-label">Usage intelligence</span><h2>Measure the work, not vanity metrics.</h2><p>Charts use account data already recorded by LEO OS. Empty data stays empty.</p></div>
    <div className="metric-grid mt-3">{metrics.map(({label,value,icon:Icon})=><div className="metric" key={label}><Icon size={15}/><strong>{value}</strong><small>{label}</small></div>)}</div>
    <Panel className="mt-3"><div className="flex items-center gap-2"><BarChart3 size={16}/><div><div className="panel-title">7-day AI activity</div><div className="panel-subtitle">Recorded token activity.</div></div></div><div className="bar-chart">{(d?.usageTrend||[]).map(v=><i key={v.date} title={`${v.tokens} tokens`} style={{height:`${Math.max(4,(v.tokens/maxTokens)*100)}%`}}/> )}</div></Panel>
  </LEOAppShell>
}
