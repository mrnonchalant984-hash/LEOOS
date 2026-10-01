import {NextRequest,NextResponse} from 'next/server';
export async function POST(req:NextRequest){
  const b=await req.json();
  const mode=b.mode==='automatic_paystack'?'automatic_paystack':'manual_email';
  if(mode==='manual_email' && !(b.admin_email || process.env.CONTACT_EMAIL || process.env.OWNER_EMAIL)) return NextResponse.json({error:'Admin email is required for manual payment.'},{status:400});
  const destination=String(b.admin_email||process.env.CONTACT_EMAIL||process.env.OWNER_EMAIL||'');
  const subject=`Payment request for ${b.item_name||'this service'}`;
  const body=`Hello, I want to pay for ${b.item_name||'this service'} for ${b.currency_symbol||''}${b.amount||''}.`;
  const mailto=destination?`mailto:${destination}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`:null;
  return NextResponse.json({mode,mailtoUrl:mailto,automaticRequires:['PAYSTACK_PUBLIC_KEY','PAYSTACK_SECRET_KEY']});
}
