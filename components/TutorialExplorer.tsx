'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, Clock3, Code2, Rocket, Sparkles, WandSparkles } from 'lucide-react';

const tracks=[
 {id:'first-project',level:'Start here',title:'Ship your first project with Leo',time:'12 min',desc:'Turn a rough idea into a structured project brief, then move through build, test and deployment.',steps:['Define the idea','Create the project','Ask Leo to build','Run checks','Deploy when verified'],href:'/setup'},
 {id:'website',level:'Build',title:'Build a production-minded website',time:'18 min',desc:'Use a project workspace, templates and Leo to create a responsive site without losing control of the implementation.',steps:['Choose a direction','Shape the information architecture','Build the UI','Review responsive states','Prepare deployment'],href:'/templates'},
 {id:'developer',level:'Developer',title:'Make your first API request',time:'15 min',desc:'Learn the authentication and request model for the LEO OS developer surface.',steps:['Create an API key','Choose scopes','Send a request','Inspect request IDs','Revoke the key'],href:'/docs/api'},
 {id:'deploy',level:'Ship',title:'Understand the deployment lifecycle',time:'10 min',desc:'Follow a deployment from queued work through build, testing and verified live state.',steps:['Open deployments','Inspect a build','Read logs','Verify the result','Review history'],href:'/deployments'},
];
export function TutorialExplorer(){
 const [active,setActive]=useState('first-project'); const [done,setDone]=useState<string[]>([]); const [open,setOpen]=useState<string|null>('first-project');
 const current=useMemo(()=>tracks.find(t=>t.id===active)!,[active]);
 const toggle=(step:string)=>setDone(d=>d.includes(step)?d.filter(x=>x!==step):[...d,step]);
 const progress=Math.round((done.filter(x=>current.steps.includes(x)).length/current.steps.length)*100);
 return <div className="tutorial-shell">
  <div className="tutorial-track-nav">{tracks.map(t=><button key={t.id} onClick={()=>{setActive(t.id);setOpen(t.id)}} className={active===t.id?'active':''}><span>{t.level}</span><strong>{t.title}</strong><small><Clock3 size={12}/>{t.time}</small></button>)}</div>
  <section className="tutorial-stage"><div className="tutorial-stage-head"><div><span className="mini-label">Interactive tutorial</span><h2>{current.title}</h2><p>{current.desc}</p></div><div className="tutorial-progress"><span>{progress}%</span><div><i style={{width:`${progress}%`}}/></div><small>local progress</small></div></div>
   <div className="tutorial-steps">{current.steps.map((step,i)=>{const checked=done.includes(step); return <button key={step} onClick={()=>toggle(step)} className={`tutorial-step ${checked?'done':''}`}><span className="tutorial-number">{checked?<Check size={14}/>:String(i+1).padStart(2,'0')}</span><span><strong>{step}</strong><small>{checked?'Marked complete':'Tap to mark this step complete'}</small></span><ChevronDown size={15}/></button>})}</div>
   <div className="tutorial-footer"><div><Sparkles size={15}/><span>Learn by doing — your checklist is stored only in this page session.</span></div><Link href={current.href}>Open related workspace <ArrowRight size={14}/></Link></div>
  </section>
  <div className="tutorial-callouts"><article><WandSparkles size={18}/><strong>Ask Leo</strong><p>Use the assistant to explain, plan or review each step instead of treating the tutorial as a passive article.</p></article><article><Code2 size={18}/><strong>Inspect the work</strong><p>Keep the implementation visible. The tutorial should teach the workflow, not hide the engineering.</p></article><article><Rocket size={18}/><strong>Ship deliberately</strong><p>Deployment is a lifecycle state. Only treat a project as live after the real deployment result is verified.</p></article></div>
 </div>
}
