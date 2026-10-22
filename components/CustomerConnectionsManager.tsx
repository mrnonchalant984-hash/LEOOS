'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, ExternalLink, KeyRound, Link2Off, LoaderCircle, Plus, RefreshCw, ShieldCheck } from 'lucide-react';

type Provider = 'github'|'vercel'|'supabase'|'firebase'|'openai'|'anthropic'|'google_gemini'|'whatsapp_business'|'meta'|'youtube'|'custom_mcp';
type Connection = { id: string; provider: Provider; label: string; status: 'configured'|'verified'|'verification_failed'; created_at: string; last_verified_at?: string|null; last_error_code?: string|null };
const providers: {id: Provider; label: string; description: string; fields: {key:string;label:string;placeholder:string;secret?:boolean}[]}[] = [
 {id:'github',label:'GitHub',description:'Repository access for the repositories authorized by your token.',fields:[{key:'token',label:'GitHub personal access token',placeholder:'github_pat_…',secret:true}]},
 {id:'vercel',label:'Vercel',description:'Manage your own projects, deployments, and custom domains.',fields:[{key:'token',label:'Vercel access token',placeholder:'Vercel token',secret:true}]},
 {id:'supabase',label:'Supabase',description:'Connect a Supabase organization/project using its Management API token.',fields:[{key:'project_url',label:'Project URL',placeholder:'https://your-project.supabase.co'},{key:'access_token',label:'Supabase access token',placeholder:'sbp_…',secret:true}]},
 {id:'firebase',label:'Firebase',description:'Save Firebase project access details. Full provider operations depend on service-account/OAuth configuration.',fields:[{key:'project_id',label:'Firebase project ID',placeholder:'my-project-id'},{key:'access_token',label:'Google OAuth access token',placeholder:'OAuth access token',secret:true}]},
 {id:'openai',label:'OpenAI',description:'Verify API key access to model inventory.',fields:[{key:'api_key',label:'OpenAI API key',placeholder:'sk-…',secret:true}]},
 {id:'anthropic',label:'Anthropic Claude',description:'Verify API key access to the models endpoint.',fields:[{key:'api_key',label:'Anthropic API key',placeholder:'sk-ant-…',secret:true}]},
 {id:'google_gemini',label:'Google Gemini',description:'Verify Gemini API key and model-list access.',fields:[{key:'api_key',label:'Gemini API key',placeholder:'Google AI Studio API key',secret:true}]},
 {id:'whatsapp_business',label:'WhatsApp Business',description:'Credentials are stored encrypted; production messaging requires a valid Meta app and approved permissions.',fields:[{key:'phone_number_id',label:'Phone number ID',placeholder:'WhatsApp phone number ID'},{key:'access_token',label:'Access token',placeholder:'Meta access token',secret:true}]},
 {id:'meta',label:'Meta / Facebook',description:'Credentials are stored encrypted; supported operations depend on app review and scopes.',fields:[{key:'access_token',label:'Access token',placeholder:'Meta access token',secret:true}]},
 {id:'youtube',label:'YouTube',description:'Credentials are stored encrypted; connect OAuth with the scopes required for analytics.',fields:[{key:'access_token',label:'OAuth access token',placeholder:'Google OAuth access token',secret:true}]},
 {id:'custom_mcp',label:'Custom MCP server',description:'For tool discovery and per-tool approval, use the dedicated MCP connection manager below.',fields:[{key:'endpoint_url',label:'HTTPS endpoint',placeholder:'https://mcp.example.com/mcp'}]},
];
export function CustomerConnectionsManager() {
 const [connections,setConnections] = useState<Connection[]>([]); const [provider,setProvider] = useState<Provider>('github');
 const [label,setLabel] = useState('My GitHub'); const [values,setValues] = useState<Record<string,string>>({});
 const [loading,setLoading] = useState(true); const [saving,setSaving] = useState(false); const [oauthLoading,setOauthLoading] = useState(false); const [error,setError] = useState(''); const [notice,setNotice] = useState('');
 const selected = providers.find(item=>item.id===provider)!;
 const fetchConnections = useCallback(async (): Promise<Connection[]> => {
  const response=await fetch('/api/integrations/connections',{cache:'no-store'});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||'Connections could not be loaded.');
  return Array.isArray(body.connections)?body.connections as Connection[]:[];
 },[]);
 const load = useCallback(async()=>{try{setConnections(await fetchConnections());setError('');}catch(e){setError(e instanceof Error?e.message:'Connections could not be loaded.');}finally{setLoading(false);}},[fetchConnections]);
 useEffect(()=>{
  let cancelled=false;
  void fetchConnections().then(items=>{if(!cancelled){setConnections(items);setError('');}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Connections could not be loaded.');}).finally(()=>{if(!cancelled)setLoading(false);});
  const params=new URLSearchParams(window.location.search);
  const oauth=params.get('oauth');
  const providerName=params.get('provider');
  let frame:number|undefined;
  if(oauth){
   const message=oauth==='connected'?`${providerName||'Provider'} connected and verified.`:oauth==='connected_needs_verification'?`${providerName||'Provider'} connected; check permissions and verification status.`:`Connection was not completed (${oauth.replaceAll('_',' ')}). Check provider app settings and try again.`;
   window.history.replaceState({},'',window.location.pathname);
   frame=window.requestAnimationFrame(()=>setNotice(message));
  }
  return ()=>{cancelled=true;if(frame!==undefined)window.cancelAnimationFrame(frame);};
 },[fetchConnections]);
 async function save(){setSaving(true);setError('');setNotice('');try{const response=await fetch('/api/integrations/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,label,config:values})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not save connection.');setNotice(`${body.verification?.status==='verified'?'Connection verified.':body.verification?.status==='configured'?'Credentials saved; provider-specific verification is still required.':'Saved, but verification failed: '+(body.verification?.message||'check the credentials')}`);setValues({});await load();}catch(e){setError(e instanceof Error?e.message:'Could not save connection.');}finally{setSaving(false);}}
 async function connectOAuth(){setOauthLoading(true);setError('');setNotice('');try{const response=await fetch('/api/integrations/oauth/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,label})});const body=await response.json();if(!response.ok)throw new Error(body.error||'OAuth could not be started.');if(typeof body.authorizationUrl!=='string')throw new Error('Provider did not return an authorization URL.');window.location.assign(body.authorizationUrl);}catch(e){setError(e instanceof Error?e.message:'OAuth could not be started.');setOauthLoading(false);}}
 async function disconnect(id:string){if(!window.confirm('Disconnect this integration from LeonardX?'))return;setError('');try{const response=await fetch(`/api/integrations/connections/${id}`,{method:'DELETE'});const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not disconnect.');setConnections(items=>items.filter(item=>item.id!==id));setNotice('Connection removed from LeonardX. If the provider issued a long-lived token, revoke it at the provider too.');}catch(e){setError(e instanceof Error?e.message:'Could not disconnect.');}}
 const badge=(status:Connection['status'])=>status==='verified'?'Verified':status==='verification_failed'?'Needs attention':'Configured, not verified';
 return <section className="mt-6 space-y-5">
  <div className="page-hero"><span className="mini-label"><ShieldCheck size={13} className="inline"/> Customer-owned integrations</span><h2>Connect your own accounts</h2><p>Credentials are encrypted before storage and are never shown again by this page. Use OAuth where available, approve only the permissions you need, and revoke access here or at the provider when finished.</p></div>
  <div className="two-grid">
   <div className="panel space-y-4"><div><h3 className="font-semibold">Add a connection</h3><p className="mt-1 text-xs text-zinc-500">Connect the accounts Leo should use for your projects.</p></div>
    <label className="block text-xs text-zinc-400">Service<select className="form-input mt-2 w-full" value={provider} onChange={e=>{const nextProvider=e.target.value as Provider;setProvider(nextProvider);setValues({});setLabel(`My ${providers.find(item=>item.id===nextProvider)?.label||'Connection'}`);}}>{providers.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <p className="text-xs leading-5 text-zinc-500">{selected.description}</p>
    <label className="block text-xs text-zinc-400">Connection name<input className="form-input mt-2 w-full" value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/></label>
    {(['github','vercel','firebase','youtube','meta','whatsapp_business'] as Provider[]).includes(provider)&&<button className="secondary-button w-full" onClick={()=>void connectOAuth()} disabled={oauthLoading||!label.trim()}>{oauthLoading?<LoaderCircle size={15} className="animate-spin"/>:<ShieldCheck size={15}/>} Connect with {selected.label}</button>}
    {selected.fields.map(field=><label key={field.key} className="block text-xs text-zinc-400">{field.label}<input className="form-input mt-2 w-full" type={field.secret?'password':'text'} autoComplete="off" value={values[field.key]||''} placeholder={field.placeholder} onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))}/></label>)}
    {provider==='custom_mcp'&&<p className="text-xs text-amber-300">For production MCP tool discovery, add this server under the MCP connection manager and approve each discovered tool separately.</p>}
    <button className="primary-button" onClick={()=>void save()} disabled={saving||!label.trim()}>{saving?<LoaderCircle size={15} className="animate-spin"/>:<Plus size={15}/>} Save connection</button>
    <p className="text-[11px] text-zinc-600"><KeyRound size={12} className="mr-1 inline"/>Requires MCP_CREDENTIAL_ENCRYPTION_KEY and the user_integrations database migration.</p>
   </div>
   <div className="panel space-y-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Your connected accounts</h3><p className="mt-1 text-xs text-zinc-500">Connection status is not a guarantee every provider capability is enabled.</p></div><button className="icon-button" onClick={()=>{setLoading(true);setError('');void load();}} aria-label="Refresh connections"><RefreshCw size={15}/></button></div>
    {loading?<p className="text-sm text-zinc-500"><LoaderCircle size={15} className="mr-2 inline animate-spin"/>Loading connections…</p>:connections.length===0?<p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">No personal connections yet. Add one to get started.</p>:connections.map(item=><div key={item.id} className="flex items-start gap-3 rounded-xl border border-white/10 p-3"><div className="mt-0.5">{item.status==='verified'?<CheckCircle2 size={17} className="text-emerald-400"/>:item.status==='verification_failed'?<CircleAlert size={17} className="text-amber-400"/>:<KeyRound size={17} className="text-zinc-400"/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.label}</strong><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-zinc-400">{badge(item.status)}</span></div><p className="mt-1 text-xs text-zinc-500">{item.provider.replaceAll('_',' ')}{item.last_verified_at?` · checked ${new Date(item.last_verified_at).toLocaleString()}`:''}</p></div><button className="icon-button" title="Disconnect" aria-label={`Disconnect ${item.label}`} onClick={()=>void disconnect(item.id)}><Link2Off size={14}/></button></div>)}
   </div>
  </div>
  {notice&&<p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</p>}{error&&<p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">{error}</p>}
  <p className="text-xs text-zinc-600"><ExternalLink size={12} className="mr-1 inline"/>Disconnecting removes LeonardX&apos;s stored credential; revoke the token at its provider to invalidate it everywhere.</p>
 </section>;
}
