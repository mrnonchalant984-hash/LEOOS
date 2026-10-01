import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { submitSitemap } from '@/lib/google';
export const runtime='nodejs';
export async function POST(req:NextRequest){
  const ctx=await requireOwner(req); if(!ctx || !ctx.profile.twofa_verified)return NextResponse.json({error:'Owner 2FA access required'},{status:403});
  try{const body=await req.json(); const siteUrl=String(body.siteUrl||'').trim(); const sitemapUrl=String(body.sitemapUrl||'').trim(); if(!siteUrl||!sitemapUrl)return NextResponse.json({error:'siteUrl and sitemapUrl are required'},{status:400}); return NextResponse.json(await submitSitemap(siteUrl,sitemapUrl));}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Google Search Console submission failed'},{status:500})}
}
