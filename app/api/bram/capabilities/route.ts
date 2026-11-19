import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PROVIDERS = ['github','vercel','firebase','youtube','meta','whatsapp_business'] as const;
export async function GET(request: NextRequest) {
 const auth=await getProfile(request); if(!auth) return NextResponse.json({error:'Authentication required.'},{status:401});
 const {data,error}=await adminSupabase().from('user_integrations').select('provider,label,status,scopes,last_verified_at,metadata').eq('user_id',auth.user.id).order('created_at',{ascending:false}).limit(100);
 if(error) return NextResponse.json({error:'Integration capabilities could not be checked.'},{status:503});
 const latest=new Map<string,Record<string,unknown>>(); for(const row of data||[]) if(!latest.has(row.provider)) latest.set(row.provider,row as Record<string,unknown>);
 const appConfigured=Boolean(process.env.GITHUB_APP_SLUG&&process.env.GITHUB_APP_ID&&process.env.GITHUB_APP_PRIVATE_KEY);
 const integrations=Object.fromEntries(PROVIDERS.map(provider=>{const row=latest.get(provider);return [provider,{connected:row?.status==='verified',status:row?.status||'not_connected',label:row?.label||null,scopes:row?.scopes||[],last_verified_at:row?.last_verified_at||null,auth_method:(row?.metadata as Record<string,unknown>|undefined)?.auth_method||null,connect_available:provider==='github'?appConfigured:true}]}));
 return NextResponse.json({checked_at:new Date().toISOString(),integrations,github_app:{configured:appConfigured,app_slug:process.env.GITHUB_APP_SLUG||null,installation_required:true,personal_access_token_required:false}},{headers:{'Cache-Control':'private, no-store'}});
}