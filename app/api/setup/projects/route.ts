import {NextRequest,NextResponse} from 'next/server'; import {getProfile,adminSupabase} from '@/lib/auth';

const websiteTypes = new Set(['company','portfolio','agency','restaurant','real_estate','ecommerce','digital_products','booking','membership','saas','blog','magazine','forum','event','school','course','church_ngo','government','landing','cv']);
const paymentModes = new Set(['automatic_paystack','manual_email']);

export async function POST(req:NextRequest){
 const ctx=await getProfile(req);
 if(!ctx)return NextResponse.json({error:'Login required'},{status:401});
 try{
  const body=await req.json();
  const websiteType=typeof body.website_type==='string'?body.website_type.trim():'';
  const businessName=typeof body.business_name==='string'?body.business_name.trim().slice(0,160):'';
  if(!websiteTypes.has(websiteType))return NextResponse.json({error:'Choose a valid website type.'},{status:400});
  if(!businessName)return NextResponse.json({error:'Business or project name is required.'},{status:400});
  if(typeof body.chatbot_enabled!=='boolean')return NextResponse.json({error:'Choose whether to enable the chatbot.'},{status:400});
  const paymentMode=typeof body.payment_mode==='string'?body.payment_mode:'manual_email';
  if(!paymentModes.has(paymentMode))return NextResponse.json({error:'Choose a valid payment option.'},{status:400});
  if(body.requirements!==undefined&&(!body.requirements||typeof body.requirements!=='object'||Array.isArray(body.requirements)))return NextResponse.json({error:'Project requirements must be an object.'},{status:400});

  const projectInput={
   website_type:websiteType,
   business_name:businessName,
   chatbot_enabled:body.chatbot_enabled,
   payment_mode:paymentMode,
   requirements:body.requirements||{},
   owner_user_id:ctx.user.id,
  };
  const {data,error}=await adminSupabase().from('website_projects').insert(projectInput).select().single();
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({project:data},{status:201});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:'Invalid project submission.'},{status:400});
 }
}
