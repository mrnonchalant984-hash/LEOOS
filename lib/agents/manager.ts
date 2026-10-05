import {getOpenAI} from '@/lib/openai';
import {defs,getAgent,listAgents} from './registry';
export {getAgent};
import {AgentDefinition} from './types';
import {runHostedBrowserAgent, isBrowserAgent} from './openai-browser';
import {generateRunwayVideo} from './runway-video';
export function classifyAgents(message:string, owner:boolean){
 if(!owner) return [];
 const m=message.toLowerCase(); const picks:string[]=[];
 const add=(id:string)=>{const a=getAgent(id);if(a&&(!a.ownerOnly||owner))picks.push(id)};
 if(/research|latest|current|compare|sources|news/.test(m)) add('research');
 if(/code|bug|debug|error|typescript|next\.js|react|python|program/.test(m)) add(/bug|error|debug/.test(m)?'debugging':'developer');
 if(/website|landing page|homepage|site|seo/.test(m)) add(/seo/.test(m)?'seo':'website-upgrade');
 if(/github|repository|repo|commit|pull request/.test(m)) add('github');
 if(/deploy|production|vercel/.test(m)) add('deployment');
 if(/database|supabase|postgres|rls|sql/.test(m)) add('database');
 if(/security|vulnerability|secret|permission/.test(m)) add('security');
 if(/test|testing|qa/.test(m)) add('qa');
 if(/image|picture|photo|generate an image/.test(m)) add('image');
 if(/video|storyboard|cinematic/.test(m)) add('video');
 if(/email|mail/.test(m)) add('email');
 if(/buy|purchase|shopping|cart|checkout/.test(m)) add('shopping');
 if(/memory|remember|forget/.test(m)) add('memory');
 if(!picks.length) picks.push('leo-manager');
 return [...new Set(picks)].map(id=>getAgent(id)!).filter(Boolean);
}
export async function runAgent(agent:AgentDefinition, task:string, context:string, owner:boolean, meta?:{runId?:string;userId?:string}){
 if(agent.ownerOnly&&!owner) throw new Error('Owner-only agent access denied');
 if(isBrowserAgent(agent)) return runHostedBrowserAgent(agent,task,context,{runId:meta?.runId,userId:meta?.userId});
 if(agent.id==='video'){
  const imageMatch=context.match(/(?:image|reference(?: image)?)\s*(?:url|uri)?\s*[:=]\s*(https?:\/\/\S+)/i);
  const durationMatch=task.match(/(?:duration|length)\s*(?:of)?\s*(\d+)\s*(?:s|sec|seconds)?/i);
  const vertical=/vertical|portrait|9:16|tiktok|reels|shorts/i.test(task);
  const result=await generateRunwayVideo({prompt:task,imageUrl:imageMatch?.[1]?.replace(/[),.]+$/,''),duration:durationMatch?Number(durationMatch[1]):5,ratio:vertical?'768:1280':'1280:768',runId:meta?.runId,userId:meta?.userId});
  return JSON.stringify(result);
 }
 const ai=getOpenAI();
 const response=await ai.responses.create({model:agent.model||'gpt-4o-mini',input:[{role:'system',content:`You are ${agent.name} inside LEO OS. ${agent.instructions}\nNever claim tool execution unless a connected tool result is present. You are a specialist, not the main Leo.`,},{role:'user',content:`Task:\n${task}\n\nRelevant context:\n${context.slice(0,18000)}`}],max_output_tokens:1200});
 return response.output_text||'No result returned.';
}

export function parseAgentExecutionResult(result:string){
 try{
  const value=JSON.parse(result);
  if(value && typeof value==='object' && typeof value.status==='string') return value as {status:string;session_id?:string;approvals?:unknown[];result?:string;message?:string};
 }catch{}
 return null;
}

export function publicAgentSummary(owner:boolean){return listAgents(owner).map(a=>({id:a.id,name:a.name,description:a.description,category:a.category,ownerOnly:a.ownerOnly,approvalRequired:a.approvalRequired,allowedTools:a.allowedTools,permissions:a.permissions}));}
