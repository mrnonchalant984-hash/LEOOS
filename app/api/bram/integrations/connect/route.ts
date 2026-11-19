import { NextRequest, NextResponse } from 'next/server';
import { POST as startGitHubApp } from '@/app/api/integrations/github-app/start/route';
import { POST as startOAuth } from '@/app/api/integrations/oauth/start/route';
import { getProfile } from '@/lib/auth';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 const auth=await getProfile(request); if(!auth) return NextResponse.json({error:'Authentication required.'},{status:401});
 const body=await request.json().catch(()=>null) as {provider?:unknown;label?:unknown}|null;
 const provider=typeof body?.provider==='string'?body.provider:'';
 if(!['github','vercel','firebase','youtube','meta','whatsapp_business'].includes(provider)) return NextResponse.json({error:'This integration cannot be connected from Bram.'},{status:400});
 const headers=new Headers(request.headers); headers.set('origin',new URL(request.url).origin); headers.set('content-type','application/json');
 const forwarded=new NextRequest(request.url,{method:'POST',headers,body:JSON.stringify({provider,label:typeof body?.label==='string'?body.label:undefined,return_to:'/app'})});
 const response=provider==='github'?await startGitHubApp(forwarded):await startOAuth(forwarded);
 const result=await response.json().catch(()=>({})); if(!response.ok) return NextResponse.json(result,{status:response.status,headers:{'Cache-Control':'no-store'}});
 return NextResponse.json({provider,authorization_url:result.authorizationUrl,expires_in_seconds:result.expiresInSeconds||600,auth_method:provider==='github'?'github_app_installation':'oauth'},{headers:{'Cache-Control':'no-store'}});
}