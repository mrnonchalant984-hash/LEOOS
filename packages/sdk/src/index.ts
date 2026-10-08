export type Project = { id:string; project_name:string; type:string|null; status:string|null; progress:number|null; file_url:string|null; files?:Record<string,unknown>; created_at:string };
export type Webhook = { id:string; name:string; endpoint_url:string; events:string[]; active:boolean; created_at:string; updated_at:string };
export type ApiResponse<T> = { data:T; request_id:string; meta?:Record<string,unknown> };

export class LeoOS {
  constructor(private readonly options:{apiKey:string;baseUrl:string}){}
  private async request<T>(path:string, init:RequestInit={}):Promise<T>{
    const res=await fetch(`${this.options.baseUrl.replace(/\/$/,'')}${path}`,{...init,headers:{Authorization:`Bearer ${this.options.apiKey}`,'Content-Type':'application/json',...(init.headers||{})}});
    const body=await res.json(); if(!res.ok) throw new Error(body?.error?.message || `LEO OS API error (${res.status})`); return body as T;
  }
  me(){return this.request<ApiResponse<Record<string,unknown>>>('/api/v2/me');}
  projects(params?:{limit?:number;status?:string}){const q=new URLSearchParams();if(params?.limit)q.set('limit',String(params.limit));if(params?.status)q.set('status',params.status);return this.request<ApiResponse<Project[]>>(`/api/v2/projects${q.size?`?${q}`:''}`);}
  createProject(input:{project_name:string;type?:string}){return this.request<ApiResponse<Project>>('/api/v2/projects',{method:'POST',body:JSON.stringify(input)});}
  project(id:string){return this.request<ApiResponse<Project>>(`/api/v2/projects/${encodeURIComponent(id)}`);}
  updateProject(id:string,input:Partial<Pick<Project,'project_name'|'type'|'status'|'progress'|'files'>>){return this.request<ApiResponse<Project>>(`/api/v2/projects/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(input)});}
  usage(limit=100){return this.request<ApiResponse<unknown[]>>(`/api/v2/usage?limit=${Math.min(limit,200)}`);}
  webhooks(){return this.request<ApiResponse<Webhook[]>>('/api/v2/webhooks');}
  createWebhook(input:{name:string;endpoint_url:string;events:string[]}){return this.request<ApiResponse<Webhook>&{secret:string}>('/api/v2/webhooks',{method:'POST',body:JSON.stringify(input)});}
  updateWebhook(id:string,input:Partial<Pick<Webhook,'name'|'endpoint_url'|'events'|'active'>>){return this.request<ApiResponse<Webhook>>(`/api/v2/webhooks/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(input)});}
  deleteWebhook(id:string){return this.request<ApiResponse<{deleted:boolean;id:string}>>(`/api/v2/webhooks/${encodeURIComponent(id)}`,{method:'DELETE'});}
}
