// 读取最多两次；有副作用的请求默认一次，由调用者先读取远程结果再续跑。
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function request(url,{method='GET',headers={},body,timeout=30000,attempts=method==='GET'?2:1,binary=false,fetcher=fetch,sleep=pause}={}){
 let last;
 for(let attempt=1;attempt<=attempts;attempt++){
  try{const response=await fetcher(url,{method,headers,body,signal:AbortSignal.timeout(timeout)});
   if(!response.ok){const e=Error('HTTP '+response.status+' '+new URL(url).origin+new URL(url).pathname);e.status=response.status;if(new URL(url).hostname==='api.github.com'){try{const detail=await response.json();if(typeof detail.message==='string')e.message+=': '+detail.message.slice(0,300);}catch{}}throw e;}
   const bytes=await response.arrayBuffer(); // 超时包括读取整个响应体
   if(binary)return Buffer.from(bytes);if(!bytes.byteLength)return null;return JSON.parse(new TextDecoder().decode(bytes));
  }catch(e){last=e;if(e.status && e.status!==429 && e.status<500)throw e;if(attempt<attempts)await sleep(1000);}
 }
 throw last;
}
export async function waitFor(check,{attempts=6,interval=20000,sleep=pause,label='远程状态'}={}){
 for(let i=0;i<attempts;i++){const result=await check();if(result)return result;if(i+1<attempts)await sleep(interval);}
 throw Error(label+'在限定等待内未完成；结果保留，稍后使用同一命令续跑。');
}
