import {PUBLIC_CONFIG} from './config.js';
const cancelled = () => new DOMException('邮箱登录已取消，本机内容保持不变。','AbortError');
// SDK 只在明确按下同步或 AI 登录按钮之后加载；没有自动挂载或启动恢复。
export function createPublicIdentity({config=PUBLIC_CONFIG,loadSdk=()=>import('@clerk/clerk-js'),fetcher=globalThis.fetch}={}) {
  let clerk, loading, cancelWait, sequence=0;
  async function load() {
    if(!config.ready)throw Error(config.message);
    if(!loading)loading=(async()=>{const {Clerk}=await loadSdk();clerk=new Clerk(config.publishableKey);await clerk.load();return clerk;})().catch(error=>{loading=null;throw error;});
    return loading;
  }
  async function authenticate(host) {
    const start=++sequence;const instance=await load();if(start!==sequence)throw cancelled();
    if(!instance.session || !instance.user) await new Promise((resolve,reject)=>{
      let off, timer;
      const finish=error=>{clearTimeout(timer);off?.();cancelWait=null;if(host)instance.unmountSignIn(host);else instance.closeSignIn();error?reject(error):resolve();};
      cancelWait=()=>finish(cancelled());
      off=instance.addListener(({session,user})=>{if(session&&user)queueMicrotask(()=>finish());});
      timer=setTimeout(()=>finish(Error('邮箱验证等待已结束，可重新开启；本机内容未改变。')),600000);
      if(host)instance.mountSignIn(host,{routing:'hash',withSignUp:true});else instance.openSignIn({withSignUp:true});
    });
    if(start!==sequence)throw cancelled();const id=instance.user.id;
    const getToken=async()=>{if(instance.user?.id!==id||!instance.session)throw cancelled();const token=await instance.session.getToken();if(instance.user?.id!==id||!token)throw cancelled();return token;};
    const response=await fetcher(config.apiUrl+'/api/account',{headers:{Authorization:'Bearer '+await getToken()},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('邮箱账号尚未完成验证，或公开云服务暂不可用。');
    const account=await response.json();
    if(start!==sequence)throw cancelled();
    if(account.id!==id||typeof account.email!=='string'||!account.email.includes('@'))throw Error('账号身份核对未通过；未开启同步。');
    return {id,email:account.email,getToken};
  }
  return {authenticate,cancel(){sequence++;cancelWait?.();},async signOut(){sequence++;cancelWait?.();if(clerk)await clerk.signOut();}};
}
