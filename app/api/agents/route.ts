import {NextRequest,NextResponse} from 'next/server';
import {getProfile,isPlatformOwner} from '@/lib/auth';
import {getEffectiveUserPlan} from '@/lib/plan-access';
import {getAllowedAgentIds} from '@/lib/agents/entitlements';
import {publicAgentSummary} from '@/lib/agents/manager';
export async function GET(req:NextRequest){
  const ctx=await getProfile(req);
  const owner=isPlatformOwner(ctx?.profile);
  if(!ctx) return NextResponse.json({agents:[],manual_agent_access:false,mode:'auto'});
  const plan=await getEffectiveUserPlan(ctx.user.id,owner);
  const allowed=getAllowedAgentIds(plan.key,owner);
  const agents=publicAgentSummary(owner).filter((agent)=>allowed===null||allowed.includes(agent.id));
  return NextResponse.json({agents,manual_agent_access:allowed===null||allowed.length>0,mode:allowed===null||allowed.length>0?'manual_and_auto':'auto',plan:plan.key});
}
