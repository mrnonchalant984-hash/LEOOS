import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getAnalyticsReport } from '@/lib/google';
export const runtime='nodejs';
export async function GET(req:NextRequest){
  const ctx=await requireOwner(req); if(!ctx || !ctx.profile.twofa_verified)return NextResponse.json({error:'Owner 2FA access required'},{status:403});
  try{const propertyId=req.nextUrl.searchParams.get('property_id')||process.env.GOOGLE_ANALYTICS_PROPERTY_ID||''; if(!propertyId)return NextResponse.json({error:'Google Analytics property is not configured'},{status:400}); return NextResponse.json(await getAnalyticsReport(propertyId));}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Google Analytics unavailable'},{status:500})}
}
