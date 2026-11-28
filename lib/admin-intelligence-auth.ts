import { createHash } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { adminSupabase,requireOwner } from '@/lib/auth';
const COOKIE='leo_admin_device',hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export async function requireTrustedOwner(req:NextRequest){const owner=await requireOwner(req);if(!owner||!owner.profile.twofa_verified)return null;const token=req.cookies.get(COOKIE)?.value;if(!token)return null;const {data,error}=await adminSupabase().from('admin_trusted_devices').select('expires_at,user_agent_hash').eq('user_id',owner.user.id).eq('token_hash',hash(token)).maybeSingle();if(error||!data||new Date(data.expires_at)<=new Date()||(data.user_agent_hash&&data.user_agent_hash!==hash(req.headers.get('user-agent')||'unknown')))return null;return owner;}
