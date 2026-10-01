import {NextRequest,NextResponse} from 'next/server';
import {requireOwner,adminSupabase} from '@/lib/auth';
import pdf from 'pdf-parse';
import JSZip from 'jszip';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const c=await requireOwner(req); if(!c||!c.profile.twofa_verified)return NextResponse.json({error:'Owner 2FA access required'},{status:403});
 const fd=await req.formData(); const file=fd.get('file'); if(!(file instanceof File))return NextResponse.json({error:'Document required.'},{status:400});
 const bytes=Buffer.from(await file.arrayBuffer()); let chunks:{title:string;content:string}[]=[];
 if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){const p=await pdf(bytes);chunks=[{title:file.name,content:p.text}];}
 else if(file.name.toLowerCase().endsWith('.zip')){const zip=await JSZip.loadAsync(bytes);for(const name of Object.keys(zip.files)){if(!/\.(txt|md|json|ts|tsx|js|jsx|css|html|csv)$/i.test(name)||zip.files[name].dir)continue;const content=(await zip.files[name].async('string')).slice(0,20000);if(content.trim())chunks.push({title:name,content});if(chunks.length>=50)break;}}
 else chunks=[{title:file.name,content:bytes.toString('utf8')}];
 if(!chunks.length)return NextResponse.json({error:'No readable content found.'},{status:400});
 const db=adminSupabase();const inserted=[];
 for(const ch of chunks){const {data,error}=await db.from('leo_knowledge').insert({title:ch.title,content:ch.content,category:String(fd.get('category')||'documents'),tags:['uploaded',file.name],source_type:'document',author:c.profile.full_name||'Leonard',status:'active',reliability:.8,confidence:.8,version:1}).select().single();if(error)continue;inserted.push(data);await db.from('leo_knowledge_versions').insert({knowledge_id:data.id,version:1,snapshot:data,changed_by:c.user.id,change_type:'created'});}
 await db.from('leo_training_audit').insert({actor_user_id:c.user.id,action:'document_ingested',details:{filename:file.name,chunks:inserted.length}});
 return NextResponse.json({inserted:inserted.length,knowledge:inserted});
}
