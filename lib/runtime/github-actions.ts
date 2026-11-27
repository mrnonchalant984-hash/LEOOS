import { createHmac, randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { getMainWebsiteGitHubToken } from '@/lib/mcp/github-app-auth';
export type RuntimeKind='workspace'|'leocode'|'skill'|'repository'|'browser';
const OPS:Record<RuntimeKind,Set<string>>={workspace:new Set(['inspect','install','test','typecheck','lint','build','git_status','git_diff']),leocode:new Set(['inspect','test','typecheck','lint','build']),skill:new Set(['run_skill_script']),repository:new Set(['git_status','git_diff','repo_test','repo_build','repo_install']),browser:new Set(['computer_use'])};
export async function queueGitHubRuntimeJob(input:{userId:string;projectId?:string|null;kind:RuntimeKind;operation:string;archive:Buffer;metadata?:Record<string,unknown>}){
 if(!OPS[input.kind].has(input.operation))throw new Error('Unsupported runtime operation.');
 const secret=process.env.CRON_SECRET||'';if(secret.length<32)throw new Error('Configure CRON_SECRET with at least 32 characters.');
 const owner=(process.env.LEO_WORKSPACE_GITHUB_OWNER||'mrnonchalant984-hash').trim(),repository=(process.env.LEO_WORKSPACE_GITHUB_REPOSITORY||'LEOOSRUNTIME').trim(),workflow=(process.env.LEO_WORKSPACE_GITHUB_WORKFLOW||'workspace-runtime.yml').trim(),ref=(process.env.LEO_WORKSPACE_GITHUB_REF||'main').trim();
 const token=await getMainWebsiteGitHubToken({owner,repository,fallbackToken:process.env.GITHUB_TOKEN});
 const check=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'LeonardX-Runtime'},cache:'no-store',signal:AbortSignal.timeout(10000)});
 const info=await check.json().catch(()=>null) as {private?:boolean}|null;if(!check.ok||info?.private!==true)throw new Error('The configured GitHub Actions runtime repository must exist and be private.');
 if(!input.archive.length||input.archive.length>8*1024*1024)throw new Error('Runtime archive exceeds the 8 MB compressed limit.');
 const id=randomUUID(),expiresAtIso=new Date(Date.now()+10*60*1000).toISOString(),storagePath=`runtime-jobs/${input.userId}/${id}.zip`;
 const upload=await adminSupabase().storage.from('leo-files').upload(storagePath,input.archive,{contentType:'application/zip',upsert:false,cacheControl:'private, no-store'});if(upload.error)throw new Error('Private runtime archive could not be stored.');
 const {error:insertError}=await adminSupabase().from('private_runtime_jobs').insert({id,owner_id:input.userId,project_id:input.projectId||null,kind:input.kind,operation:input.operation,status:'queued',storage_path:storagePath,metadata:input.metadata||{},expires_at:expiresAtIso});
 if(insertError){await adminSupabase().storage.from('leo-files').remove([storagePath]);throw new Error('Runtime job could not be recorded. Apply the private runtime jobs migration.');}
 const expiresAt=String(Math.floor(Date.now()/1000)+600),signature=createHmac('sha256',secret).update([id,input.userId,input.kind,input.operation,expiresAt].join('.')).digest('hex');
 const dispatch=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'LeonardX-Runtime'},body:JSON.stringify({ref,inputs:{job_id:id,user_id:input.userId,kind:input.kind,operation:input.operation,expires_at:expiresAt,ticket_signature:signature}}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(dispatch.status!==204){await adminSupabase().from('private_runtime_jobs').update({status:'failed',error:`GitHub dispatch failed (${dispatch.status}).`,completed_at:new Date().toISOString()}).eq('id',id);await adminSupabase().storage.from('leo-files').remove([storagePath]);throw new Error(`GitHub Actions dispatch failed (${dispatch.status}); verify Actions: write permission and workflow availability.`);}
 return {job_id:id,status:'queued',provider:'github_actions',kind:input.kind,operation:input.operation};
}
