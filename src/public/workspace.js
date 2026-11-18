import {createSyncApi} from '../sync/syncApi.js';
import {createSyncEngine} from '../sync/syncEngine.js';
import {resolveConflict} from '../sync/resolveConflict.js';
import {PUBLIC_CONFIG} from './config.js';
import {createPublicIdentity} from './identity.js';
import {PUBLIC_DATABASE,publicStore,accountKey,associateAnonymous} from './store.js';
const ACTIVE_KEY='personal-workbench.public.active-account.v1';
const interrupted=()=>new DOMException('账号状态已变化；原账号的内容和待上传队列仍留在原空间。','AbortError');
const validAccount=a=>a&&typeof a.id==='string'&&/^user_[A-Za-z0-9_-]{1,180}$/.test(a.id)&&typeof a.email==='string';
export function createPublicWorkspace({indexedDB=globalThis.indexedDB,storage,config=PUBLIC_CONFIG,identity=createPublicIdentity({config}),fetcher=globalThis.fetch,database=PUBLIC_DATABASE,engineOptions={}}={}) {
  try{storage??=globalThis.localStorage;}catch{storage=null;}
  const listeners=new Set();let scope=null,store,snapshot,status={phase:'local',message:'已保存到本机；云同步按需开启。'},generation=0,engine,api,context,pending,unsubscribe,guard=()=>true,closed=false;
  let state={configured:config.ready,configMessage:config.message,activeAccount:null,signedInAccount:null,pending:null,busy:false,switching:false,error:'',grants:[],grantsLoaded:false,mcpUrl:config.mcpUrl,auth:{state:'disconnected',canWrite:false,remembered:false},message:''};
  const emit=()=>{if(closed)return;for(const fn of listeners)fn({state:{...state},snapshot:snapshot?{...snapshot,publicAccountKey:accountKey(scope?.id)}:null,status:{...status}});};
  const fail=e=>{state={...state,error:e.message};emit();};
  function assertChange(){if(state.busy)throw Error('账号操作正在进行，请等待完成或取消登录。');if(!guard())throw Error('请先保存或取消当前编辑，再切换账号或关联本机事项。');}
  function stop(){generation++;engine?.stop();engine=null;api=null;context=null;state.auth={state:'disconnected',canWrite:false,remembered:false};}
  async function activate(account){
    const start=++generation;state.switching=true;emit();engine?.stop();engine=null;api=null;context=null;unsubscribe?.();
    const nextScope=account?{id:account.id,email:account.email}:null,nextStore=publicStore({indexedDB,name:database,id:nextScope?.id});
    try{
      const next=await nextStore.read();if(start!==generation)throw interrupted();await store?.close();if(start!==generation)throw interrupted();
      // 新账号读取完成后才同时替换数据、队列和账号标识；过渡期间任何旧视图保存均拒绝。
      store=nextStore;scope=nextScope;state.activeAccount=scope;
      unsubscribe=store.subscribe(value=>{if(store===nextStore){snapshot=value;emit();}});snapshot=next;status={phase:'local',message:scope?'当前显示此账号的本机缓存；点击开启云同步后验证邮箱。':'已保存到本机；云同步按需开启。'};
      state.auth={state:'disconnected',canWrite:false,remembered:false};
      try{if(scope)storage?.setItem(ACTIVE_KEY,JSON.stringify(scope));else storage?.removeItem(ACTIVE_KEY);}catch{state.error='当前账号已切换，但浏览器没有保存重开偏好。';}
      return {...snapshot,publicAccountKey:accountKey(scope?.id)};
    }catch(error){if(store!==nextStore)await nextStore.close();throw error;}finally{if(start===generation){state.switching=false;emit();}}
  }
  function startSync(account){
    const start=generation;context=account;
    const auth={getStatus:()=>({state:context===account?'connected':'disconnected',canWrite:context===account}),async getAccessToken(){if(start!==generation||context!==account||scope?.id!==account.id)throw interrupted();let token;try{token=await account.getToken();}catch(error){if(start===generation){state.auth={state:'disconnected',canWrite:false,remembered:false};emit();}throw Object.assign(Error('当前邮箱会话已变化，请重新连接此账号。'),{kind:'login'});}if(start!==generation||context!==account||scope?.id!==account.id)throw interrupted();return token;}};
    api=createSyncApi({auth,issuer:config.apiUrl,fetcher});
    engine=createSyncEngine({...engineOptions,store,api,onStatus:next=>{if(start===generation){status={...status,...next};emit();}}});
    state.auth={state:'connected',canWrite:true,remembered:true};state.signedInAccount={id:account.id,email:account.email};state.error='';emit();if(snapshot?.enabled)engine.wake();
  }
  async function login(host){if(!config.ready)throw Error(config.message);assertChange();stop();pending=null;state.pending=null;state.grants=[];state.grantsLoaded=false;const start=generation;state.busy=true;state.error='';emit();try{const account=await identity.authenticate(host);if(start!==generation)throw interrupted();if(!validAccount(account)||typeof account.getToken!=='function')throw Error('账号身份核对未通过。');state.signedInAccount={id:account.id,email:account.email};return account;}finally{state.busy=false;emit();}}
  async function associate(account,includeAnonymous,revision){assertChange();const start=generation;state.busy=true;emit();try{await associateAnonymous({indexedDB,name:database,account,includeAnonymous,expectedRevision:revision});if(start!==generation||closed)throw interrupted();pending=null;state.pending=null;await activate(account);startSync(account);return snapshot;}finally{state.busy=false;emit();}}
  async function accountRequest(account,path,method='GET'){
    const start = generation;
    const token = await account.getToken();
    if (start !== generation || !token) throw interrupted();
    try {
      const response = await fetcher(config.apiUrl + path, {
        method, headers: {Authorization: 'Bearer ' + token}, credentials: 'omit',
        cache: 'no-store', signal: AbortSignal.timeout(15000)
      });
      if ([401, 403].includes(response.status)) {
        throw Object.assign(Error('登录或授权已失效，请重新验证邮箱。'), {kind: 'login'});
      }
      if (!response.ok) throw Error('公开云请求未完成，原事项保持不变。');
      return response.status === 204 ? null : await response.json();
    } catch (error) {
      if (method === 'GET' && path === '/api/grants' && error.kind !== 'login') {
        throw Object.assign(Error('授权列表未能加载，请稍后重试。', {cause: error}), {kind: 'grantsUnavailable'});
      }
      throw error;
    } finally {
      if (start !== generation) throw interrupted();
    }
  }
  let aiContext;
  return {
    config,getState:()=>({...state}),getSnapshot:()=>snapshot?{...snapshot,publicAccountKey:accountKey(scope?.id)}:null,getStatus:()=>({...status}),
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},setChangeGuard(fn){guard=fn??(()=>true);},
    preferenceStorage(){const key=accountKey(scope?.id);return {getItem:name=>storage?.getItem('personal-workbench.public.preference:'+key+':'+name)??null,setItem:(name,value)=>storage?.setItem('personal-workbench.public.preference:'+key+':'+name,value),removeItem:name=>storage?.removeItem('personal-workbench.public.preference:'+key+':'+name)};},
    async initialize(){closed=false;pending=null;aiContext=null;state.pending=null;state.signedInAccount=null;state.grants=[];state.grantsLoaded=false;let saved=null;try{saved=JSON.parse(storage?.getItem(ACTIVE_KEY)??'null');}catch{}return activate(validAccount(saved)?saved:null);},
    async save(data,revision,options){if(state.switching)throw Error('账号空间正在切换，输入已保留，请稍后保存。');const start=generation,current=store;if(!current)throw Error('本机空间尚未准备好。');const result=await current.save(data,revision,options);if(start!==generation||store!==current)throw interrupted();snapshot=result;emit();engine?.wake();return {...result,publicAccountKey:accountKey(scope?.id)};},
    async checkReminders(...args){if(state.switching)throw interrupted();const start=generation,current=store;const result=await current.checkReminders(...args);if(start!==generation)throw interrupted();snapshot=result;emit();engine?.wake();return {...result,publicAccountKey:accountKey(scope?.id)};},
    async requestSync({host}={}){try{const account=await login(host),start=generation;const anonymous=publicStore({indexedDB,name:database});let local;try{local=await anonymous.read();}finally{await anonymous.close();}if(start!==generation||closed)throw interrupted();if(local.data.items.length){pending={account,revision:local.revision};state.pending={id:account.id,email:account.email,count:local.data.items.length,revision:local.revision};emit();return false;}return await associate(account,false,local.revision);}catch(e){fail(e);throw e;}},
    async confirmAssociation(){if(!pending)throw Error('请先核对账号和本机数量。');try{const saved=await associate(pending.account,true,pending.revision);return saved;}catch(e){fail(e);throw e;}},
    cancelAssociation(){pending=null;state.pending=null;state.error='已取消关联，本机事项仍可编辑。';emit();},
    cancelLogin(){identity.cancel?.();},
    async logout(){assertChange();stop();pending=null;aiContext=null;state.pending=null;state.signedInAccount=null;state.grants=[];state.grantsLoaded=false;await activate(null);try{await identity.signOut();}catch{state.error='已停止本机云连接；邮箱会话退出尚未确认，可稍后重试。';emit();}},
    async changeAccount(){assertChange();await this.logout();},
    async enabled(value){try{if(value){if(!context)return await this.requestSync();assertChange();await associateAnonymous({indexedDB,name:database,account:context,includeAnonymous:false});snapshot=await store.read();emit();engine?.wake();}else{engine?.interrupt();snapshot=await store.setEnabled(false);status={...status,phase:'paused',message:'自动同步已暂停，待上传修改保留。'};emit();}}catch(e){fail(e);throw e;}},
    async resolve(input){const start=generation,current=store,currentApi=api;if(!currentApi)throw Error('请先连接当前账号。');try{const next=await resolveConflict({store:current,api:currentApi,...input});if(start!==generation)throw interrupted();snapshot=next;emit();engine?.wake();}catch(e){fail(e);throw e;}},
    async connectAi({host} = {}) {
      const previous = context;
      try {
        const account = await login(host);
        aiContext = account;
        if (scope && scope.id !== account.id) await activate(null);
        const start = generation;
        let listError;
        try {
          const result = await accountRequest(account, '/api/grants');
          state.grants = result.items ?? result.grants ?? [];
          state.grantsLoaded = true;
        } catch (error) {
          if (error.kind !== 'grantsUnavailable') throw error;
          listError = error;
        }
        // 只接续这次登录重新核对过的原同步账号，列表是否可读单独反馈。
        if (generation !== start || closed) throw interrupted();
        if (previous?.id === account.id && scope?.id === account.id) startSync(account);
        if (listError) throw listError;
        state.error = '连接 AI 不会关联或上传本机事项。';
        emit();
        return state.grants;
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    async revokeGrant(id){if(!aiContext)throw Error('请先验证要管理的邮箱账号。');try{await accountRequest(aiContext,'/api/grants/'+encodeURIComponent(id),'DELETE');const result=await accountRequest(aiContext,'/api/grants');state.grants=result.items??result.grants??[];emit();}catch(e){fail(e);throw e;}},
    async runNow(){await engine?.run();return this.getStatus();},wake(){engine?.wake();},
    async reload(){const start=generation,current=store;const next=await current?.read();if(start===generation&&next){snapshot=next;emit();}},
    async close(){closed=true;stop();identity.cancel?.();unsubscribe?.();listeners.clear();const closing=store;store=undefined;await closing?.close();},
  };
}
