import {NextRequest,NextResponse} from 'next/server';
import {getProfile,isPlatformOwner} from '@/lib/auth';
import {publicAgentSummary} from '@/lib/agents/manager';
export async function GET(req:NextRequest){const ctx=await getProfile(req);return NextResponse.json({agents:publicAgentSummary(isPlatformOwner(ctx?.profile))});}
