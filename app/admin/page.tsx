"use client";import {useEffect,useState} from 'react';import Link from 'next/link';import {createBrowserClient} from '@supabase/ssr';import {BarChart3,BookOpen,FolderKanban,Menu,Settings2,Sparkles,Users,X} from 'lucide-react';import {GlassCard} from '@/components/GlassCard';
export default function Admin(){const [d,setD]=useState<any>(null);const [setup,setSetup]=useState<any>(null);const [reauth,setReauth]=useState(false);const [code,setCode]=useState('');const [tick,setTick]=useState(0);const [navOpen,setNavOpen]=useState(false);useEffect(()=>{(async()=>{const s=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);const {data:{session}}=await s.auth.getSession();if(!session){location.href='/auth';return}let r=await fetch('/api/admin/overview',{headers:{Authorization:`Bearer ${session.access_token}`}});let j=await r.json();if(j.setup){let q=await fetch('/api/admin/2fa',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'setup'})});setSetup(await q.json());}else if(j.reauth){setReauth(true)}else setD(j)})()},[tick]);useEffect(()=>{const id=setInterval(()=>setTick(x=>x+1),5000);return()=>clearInterval(id)},[]);async function verify(){const s=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);const {data:{session}}=await s.auth.getSession();const r=await fetch('/api/admin/2fa',{method:'POST',headers:{Authorization:`Bearer ${session?.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'verify',code})});const j=await r.json();if(j.ok)location.reload();else alert(j.error)}if(reauth)return <main className='mx-auto max-w-xl px-4 py-16'><GlassCard className='p-8'><h1 className='text-3xl font-black'>Verify this device</h1><p className='mt-3 text-zinc-400'>This browser is not yet trusted. Enter the code from your authenticator app once. Future visits on this device will not ask again while the trusted-device authorization is valid (up to 365 days).</p><input value={code} onChange={e=>setCode(e.target.value)} className='mt-6 w-full rounded-xl bg-black p-3' placeholder='6-digit code'/><button onClick={verify} className='mt-4 w-full rounded-full bg-orange-500 p-3 font-bold'>Trust this device</button></GlassCard></main>;if(setup)return <main className='mx-auto max-w-xl px-4 py-16'><GlassCard className='p-8'><h1 className='text-3xl font-black'>Secure Admin</h1><p className='mt-3 text-zinc-400'>Scan this QR code in Google Authenticator or another TOTP app.</p>{setup.qr&&<img className='mx-auto my-6 rounded-xl bg-white p-3' src={setup.qr} alt='2FA QR code'/>}<input value={code} onChange={e=>setCode(e.target.value)} className='w-full rounded-xl bg-black p-3' placeholder='6-digit code'/><button onClick={verify} className='mt-4 w-full rounded-full bg-orange-500 p-3 font-bold'>Verify 2FA</button></GlassCard></main>;return <main className='mx-auto max-w-7xl px-4 py-8'><div className='mb-6 flex items-center justify-between lg:hidden'><div><p className='text-xs font-bold text-orange-300'>OWNER CONTROL CENTER</p><h1 className='text-2xl font-black'>LEO OS Admin</h1></div><button type='button' onClick={()=>setNavOpen(!navOpen)} aria-expanded={navOpen} aria-label={navOpen?'Close admin navigation':'Open admin navigation'} className='flex h-11 w-11 items-center justify-center rounded-xl border border-white/10'>{navOpen?<X size={20}/>:<Menu size={20}/>}</button></div><div className='grid gap-6 lg:grid-cols-[240px_1fr]'><aside className={`${navOpen?'block':'hidden'} rounded-2xl border border-white/10 bg-zinc-950 p-4 lg:block`}><p className='hidden px-3 pb-3 text-xs font-bold uppercase text-orange-300 lg:block'>Admin command center</p><nav aria-label='Admin sections' className='grid gap-1'><a href='#overview' onClick={()=>setNavOpen(false)} className='rounded-xl bg-white/10 px-3 py-3 text-sm font-semibold'>Overview</a><Link href='/admin/agents' className='rounded-xl px-3 py-3 text-sm hover:bg-white/10'>🤖 Agents</Link><Link href='/admin/leo/training' className='rounded-xl px-3 py-3 text-sm hover:bg-white/10'><BookOpen size={16} className='mr-2 inline'/>Leo Training</Link><a href='#users' onClick={()=>setNavOpen(false)} className='rounded-xl px-3 py-3 text-sm hover:bg-white/10'><Users size={16} className='mr-2 inline'/>Users</a><a href='#analytics' onClick={()=>setNavOpen(false)} className='rounded-xl px-3 py-3 text-sm hover:bg-white/10'><BarChart3 size={16} className='mr-2 inline'/>Analytics</a><a href='#projects' onClick={()=>setNavOpen(false)} className='rounded-xl px-3 py-3 text-sm hover:bg-white/10'><FolderKanban size={16} className='mr-2 inline'/>Projects &amp; Deployments</a><div className='rounded-xl px-3 py-3 text-sm text-zinc-500'><Sparkles size={16} className='mr-2 inline'/>Announcements <span className='block pl-6 text-xs'>Unavailable</span></div><div className='rounded-xl px-3 py-3 text-sm text-zinc-500'><Settings2 size={16} className='mr-2 inline'/>System Configuration <span className='block pl-6 text-xs'>Unavailable</span></div></nav></aside><div className='min-w-0'><section id='overview'><h1 className='hidden text-4xl font-black lg:block'>LEO OS Admin</h1>
<div className='mt-8 grid gap-5 md:grid-cols-3 lg:grid-cols-6'>
<div className='rounded-xl border border-white/10 p-4'>
<p className='text-zinc-400'>Users</p>
<b className='text-3xl'>{d?.users?.length||0}</b>
</div>
<div className='rounded-xl border border-white/10 p-4'>
<p className='text-zinc-400'>Payments</p>
<b className='text-3xl'>{d?.payments?.length||0}</b>
</div>
<div className='rounded-xl border border-white/10 p-4'>
<p className='text-zinc-400'>Subscriptions</p>
<b className='text-3xl'>{d?.subscriptions?.length||0}</b>
</div>
<div className='rounded-xl border border-white/10 p-4'>
<p className='text-zinc-400'>AI Tokens</p>
<b className='text-3xl'>{(d?.analytics?.all?.totalTokens||0).toLocaleString()}</b>
</div>
<div className='rounded-xl border border-white/10 p-4'>
<p className='text-zinc-400'>Credits Used</p>
<b className='text-3xl'>{(d?.analytics?.all?.totalCredits||0).toLocaleString()}</b>
</div>
<div className='rounded-xl border border-white/10 p-4'>
<p className='text-zinc-400'>AI Requests</p>
<b className='text-3xl'>{d?.analytics?.all?.requests||0}</b>
<div className='mt-1 text-xs text-green-400'>● Live • 5s refresh</div>
</div>
</div>
<div className='mt-8 grid gap-5 lg:grid-cols-2'>
<div className='rounded-xl border border-white/10 p-6'>
<h2 className='text-xl font-bold'>Realtime AI Usage</h2>
<div className='mt-4 space-y-3'>{(d?.analytics?.all?.byFeature||[]).map(([name,v]:any)=><div key={name} className='rounded-xl border border-white/10 p-4'><div className='flex justify-between'><b>{name}</b><span className='text-zinc-400'>{v.requests} requests</span></div><div className='mt-2 text-sm text-zinc-400'>{(v.tokens||0).toLocaleString()} tokens • {(v.credits||0).toLocaleString()} credits</div></div>)}</div></div>
<div className='rounded-xl border border-white/10 p-6 overflow-auto'>
<h2 className='text-xl font-bold'>Recent Usage</h2>
<table className='mt-4 w-full text-left text-sm'>
<thead>
<tr>
<th>Feature</th>
<th>Tokens</th>
<th>Credits</th>
<th>Time</th>
</tr>
</thead>
<tbody>{(d?.recentUsage||[]).map((u:any,i:number)=><tr key={i} className='border-t border-white/10'><td className='py-3'>{u.feature}</td><td>{(u.total_tokens||0).toLocaleString()}</td><td>{u.credits_used||0}</td><td>{new Date(u.created_at).toLocaleTimeString()}</td></tr>)}</tbody></table>
</div>
<div className='mt-8 overflow-auto p-6'>
<h2 className='text-xl font-bold'>Hosting renewals</h2>
<p className='mt-1 text-sm text-zinc-400'>Free trials and paid hosting periods tracked from the database.</p>
<table className='mt-4 w-full text-left text-sm'>
<thead>
<tr>
<th>Client</th>
<th>Status</th>
<th>Expires</th>
</tr>
</thead>
<tbody>{(d?.hosting||[]).map((h:any)=><tr key={h.id} className='border-t border-white/10'><td className='py-3'>{h.client_email}</td><td>{h.status}</td><td>{new Date(h.ends_at).toLocaleDateString()}</td></tr>)}</tbody></table>
</div>
<div className='mt-8 overflow-auto p-6'>
<h2 className='text-xl font-bold'>Users</h2>
<table className='mt-4 w-full text-left text-sm'>
<thead>
<tr>
<th>Email</th>
<th>Role</th>
<th>Joined</th>
</tr>
</thead>
<tbody>{(d?.users||[]).map((u:any)=><tr key={u.id} className='border-t border-white/10'><td className='py-3'>{u.email}</td><td>{u.role}</td><td>{new Date(u.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>
		</div>
	</div>
	</section></div></div></main>}
