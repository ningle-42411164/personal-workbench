import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionRecovery } from '../src/cloud/connectionRecovery.js';

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
