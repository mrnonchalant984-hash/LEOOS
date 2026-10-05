import {adminSupabase} from '@/lib/auth';

const RUNWAY_URL='https://api.dev.runwayml.com/v1';
const RUNWAY_VERSION='2024-11-06';

function headers(){
  const key=process.env.RUNWAYML_API_SECRET;
  if(!key) throw new Error('RUNWAYML_API_SECRET is not configured.');
  return {'Content-Type':'application/json','Authorization':`Bearer ${key}`,'X-Runway-Version':RUNWAY_VERSION};
}

async function runway(path:string,init?:RequestInit){
  const r=await fetch(`${RUNWAY_URL}${path}`,{...init,headers:{...headers(),...(init?.headers||{})}});
  const text=await r.text();
  let data:any=null; try{data=text?JSON.parse(text):null}catch{data={raw:text}};
  if(!r.ok) throw new Error(data?.error?.message||data?.message||`Runway API error (${r.status})`);
  return data;
}

async function persist(runId:string|undefined,userId:string|undefined,patch:any){
  if(!runId||!userId)return;
  const db=adminSupabase();
  const {data}=await db.from('agent_runs').select('metadata').eq('id',runId).eq('user_id',userId).maybeSingle();
  await db.from('agent_runs').update({metadata:{...(data?.metadata||{}),...patch}}).eq('id',runId).eq('user_id',userId);
}

export async function createRunwayVideo(opts:{prompt:string;imageUrl?:string;duration?:number;ratio?:'1280:768'|'768:1280';model?:string;runId?:string;userId?:string}){
  const model=opts.model||process.env.RUNWAY_VIDEO_MODEL||'gen4.5';
  const duration=Math.min(10,Math.max(2,Number(opts.duration)||5));
  const ratio=opts.ratio||'1280:768';
  const payload:any={model,promptText:opts.prompt,ratio,duration};
  if(opts.imageUrl) payload.promptImage=opts.imageUrl;
  const task=await runway('/image_to_video',{method:'POST',body:JSON.stringify(payload)});
  await persist(opts.runId,opts.userId,{runway_task_id:task.id,runway_model:model,video_status:'processing'});
  return {status:'processing',task_id:task.id,model,duration,ratio};
}

export async function getRunwayVideo(taskId:string,runId?:string,userId?:string){
  const task=await runway(`/tasks/${encodeURIComponent(taskId)}`);
  const status=String(task.status||'').toUpperCase();
  if(status==='SUCCEEDED'){
    const sourceUrl=Array.isArray(task.output)?task.output[0]:null;
    if(!sourceUrl) throw new Error('Runway completed but returned no video URL.');
    let videoUrl=sourceUrl;
    // Runway output URLs are temporary. Copy the result into the existing private LEO file bucket.
    if(userId){
      const fileResponse=await fetch(sourceUrl);
      if(fileResponse.ok){
        const buffer=Buffer.from(await fileResponse.arrayBuffer());
        const path=`agent-videos/${userId}/${taskId}.mp4`;
        const db=adminSupabase();
        const upload=await db.storage.from('leo-files').upload(path,buffer,{contentType:'video/mp4',upsert:true});
        if(!upload.error){
          const signed=await db.storage.from('leo-files').createSignedUrl(path,60*60*24*7);
          if(!signed.error&&signed.data?.signedUrl) videoUrl=signed.data.signedUrl;
        }
      }
    }
    await persist(runId,userId,{runway_task_id:taskId,video_status:'completed',video_url:videoUrl,runway_source_url:sourceUrl});
    return {status:'completed',task_id:taskId,video_url:videoUrl};
  }
  if(status==='FAILED'||status==='CANCELED'){
    const message=task.failure||task.failureCode||`Runway task ${status.toLowerCase()}.`;
    await persist(runId,userId,{runway_task_id:taskId,video_status:status.toLowerCase(),video_error:message});
    return {status:'failed',task_id:taskId,error:message};
  }
  await persist(runId,userId,{runway_task_id:taskId,video_status:status.toLowerCase()||'processing'});
  return {status:'processing',task_id:taskId};
}

export async function generateRunwayVideo(opts:{prompt:string;imageUrl?:string;duration?:number;ratio?:'1280:768'|'768:1280';model?:string;runId?:string;userId?:string}){
  const created=await createRunwayVideo(opts);
  return created;
}
