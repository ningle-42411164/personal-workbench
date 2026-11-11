import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionRecovery } from '../src/cloud/connectionRecovery.js';
import { syncDisplayMode } from '../src/sync/syncDisplay.js';

test('回退图标跟随提示，重试和部分补传保持本地模式，仅成功补传解除', async () => {
  let localFallback = false, notices = 0, release;
  const jobs = new Map(); let sequence = 0;
  const snapshot = { enabled:true, dirty:{ item:true }, blocked:{} };
  const auth = { state:'connected', remembered:true, canWrite:true };
  let status = { phase:'syncing', lastSuccess:123 };
  let response = new Promise(resolve=>{release=resolve;});
  const recovery = createConnectionRecovery({
    auth:{getStatus:()=>auth,restore:async()=>{}},
    onFallback(){localFallback=true;notices++;},onRecovered(){localFallback=false;},
    schedule(fn,ms){jobs.set(++sequence,{fn,ms});return sequence;},cancel(id){jobs.delete(id);},
  });
  recovery.setSynchronize(()=>response);
  const display=()=>syncDisplayMode(snapshot,status,auth,localFallback);
  const running=recovery.run();await Promise.resolve();await Promise.resolve();
  assert.equal(display(),'syncing');
  [...jobs.values()].find(job=>job.ms===3000).fn();
  assert.equal(display(),'fallback');assert.equal(notices,1);
  release({phase:'failed'});await running;
  for(const phase of ['syncing','pending','conflict','paused','failed']) {
    status={phase,lastSuccess:123};response=Promise.resolve(status);
    await recovery.run();assert.equal(display(),'fallback');assert.equal(notices,1);
    assert.equal(Object.keys(snapshot.dirty).length,1);
  }
  snapshot.enabled=false;assert.equal(display(),'local');snapshot.enabled=true;
  status={phase:'ready',lastSuccess:456};response=Promise.resolve(status);
  await recovery.run();assert.equal(localFallback,false);
  assert.equal(display(),'pending'); // 即使报告 ready，只要还有待同步项也不能显示已同步。
  snapshot.dirty={};assert.equal(display(),'ready');
  snapshot.blocked={item:true};assert.equal(display(),'conflict');
  recovery.stop();
});

function fixture() {
  const jobs = new Map(); let sequence = 0, notices = 0, requests = 0, syncs = 0;
  const state = { state:'offline', remembered:true };
  const controls = { fail:true, hold:null, phase:'ready', visible:true };
  const auth = { getStatus:()=>state, async restore() {
    requests++;
    if (controls.hold) await controls.hold;
    if (['expired','disconnected'].includes(state.state)) return;
    if (controls.fail) throw new Error('offline');
    state.state = 'connected';
  } };
  const recovery = createConnectionRecovery({auth,onFallback:()=>notices++,visible:()=>controls.visible,
    schedule(fn,ms) { jobs.set(++sequence,{fn,ms}); return sequence; },cancel(id) { jobs.delete(id); }});
  recovery.setSynchronize(async()=>{syncs++;return {phase:controls.phase};});
  return {recovery,controls,state,jobs,get notices(){return notices;},get requests(){return requests;},get syncs(){return syncs;}};
}

test('首个明确失败提示一次，5/10/20 秒静默退避，无 online 事件也恢复',async()=>{
  const f=fixture();
  for (const delay of [5000,10000,20000,20000]) {
    await f.recovery.run(); assert.equal(f.notices,1); assert.equal([...f.jobs.values()].at(-1).ms,delay);
  }
  f.controls.fail=false;
  [...f.jobs.values()].at(-1).fn();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.syncs,1);assert.equal(f.state.state,'connected');
  f.controls.fail=true;await f.recovery.run();assert.equal(f.notices,2);
  f.recovery.stop();assert.equal(f.jobs.size,0);
});
test('3 秒只提示，不取消请求；重复入口只发一次，成功后继续同步',async()=>{
  const f=fixture(); let release;
  f.controls.fail=false;f.controls.hold=new Promise(resolve=>{release=resolve;});
  const first=f.recovery.run();const second=f.recovery.run(true);
  await Promise.resolve();assert.equal(f.requests,1);
  [...f.jobs.values()].find(job=>job.ms===3000).fn();assert.equal(f.notices,1);
  assert.equal(f.syncs,0);release();await Promise.all([first,second]);assert.equal(f.syncs,1);
  f.recovery.stop();
});
test('同步积压失败继续退避，暂停、授权过期和退出不被调度器改写',async()=>{
  const f=fixture();f.controls.fail=false;f.controls.phase='failed';
  await f.recovery.run();await f.recovery.run();assert.equal(f.notices,1);
  f.controls.phase='paused';await f.recovery.run();assert.equal(f.controls.phase,'paused');
  f.state.state='expired';f.state.remembered=false;const count=f.syncs;
  await f.recovery.run();assert.equal(f.syncs,count);assert.equal(f.jobs.size,0);
  f.state.state='disconnected';await f.recovery.run();assert.equal(f.syncs,count);
  f.recovery.stop();
});
