import * as vscode from 'vscode';
import type { LeonardXApi } from './api/client';

type Catalog = { models?: Array<{id?:string;name?:string}> };
function messageText(message:vscode.LanguageModelChatRequestMessage):string {
  return message.content.filter((part):part is vscode.LanguageModelTextPart=>part instanceof vscode.LanguageModelTextPart).map(part=>part.value).join('');
}
export class LeonardXLanguageModelProvider implements vscode.LanguageModelChatProvider<vscode.LanguageModelChatInformation> {
  constructor(private readonly api:LeonardXApi) {}
  async provideLanguageModelChatInformation(_options:vscode.PrepareLanguageModelChatModelOptions,token:vscode.CancellationToken):Promise<vscode.LanguageModelChatInformation[]> {
    if(token.isCancellationRequested)return [];
    try {
      const catalog=await this.api.request<Catalog>('/api/leocode/agent/v1/models');
      return (catalog.models||[]).filter((m):m is {id:string;name?:string}=>typeof m.id==='string'&&/^[a-zA-Z0-9._/-]{1,160}$/.test(m.id)).map(m=>({
        id:m.id,name:m.name||m.id,family:'Gemini',version:'LeonardX managed',maxInputTokens:128000,maxOutputTokens:8192,
        detail:'LeonardX account · server-routed Gemini',tooltip:'Authenticated and usage-accounted by LeonardX.',capabilities:{imageInput:false,toolCalling:false}
      }));
    } catch { return []; }
  }
  async provideLanguageModelChatResponse(model:vscode.LanguageModelChatInformation,messages:readonly vscode.LanguageModelChatRequestMessage[],_options:vscode.ProvideLanguageModelChatResponseOptions,progress:vscode.Progress<vscode.LanguageModelResponsePart>,token:vscode.CancellationToken):Promise<void> {
    const controller=new AbortController();
    const subscription=token.onCancellationRequested(()=>controller.abort());
    try {
      const body={model:model.id,messages:messages.map(m=>({role:m.role===vscode.LanguageModelChatMessageRole.User?'user':'assistant',content:messageText(m)})).filter(m=>m.content),stream:true,max_tokens:8192};
      const response=await this.api.requestStream('/api/leocode/agent/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify(body),signal:controller.signal});
      if(!response.body)throw new Error('LeonardX returned an empty streaming response.');
      const reader=response.body.getReader();const decoder=new TextDecoder();let pending='';
      const emit=(line:string)=>{
        if(!line.startsWith('data:'))return;
        const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')return;
        const data=JSON.parse(raw) as {choices?:Array<{delta?:{content?:unknown}}>;error?:{message?:string}};
        if(data.error?.message)throw new Error(data.error.message);
        const content=data.choices?.[0]?.delta?.content;
        if(typeof content==='string'&&content)progress.report(new vscode.LanguageModelTextPart(content));
      };
      while(true){if(token.isCancellationRequested)return;const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let n=pending.indexOf('\n');while(n>=0){emit(pending.slice(0,n).replace(/\r$/,''));pending=pending.slice(n+1);n=pending.indexOf('\n');}}
      pending+=decoder.decode();if(pending.trim())emit(pending.trim());
    } finally {subscription.dispose();}
  }
  async provideTokenCount(_model:vscode.LanguageModelChatInformation,value:string|vscode.LanguageModelChatRequestMessage,_token:vscode.CancellationToken):Promise<number>{
    return Math.ceil((typeof value==='string'?value:messageText(value)).length/4);
  }
}
