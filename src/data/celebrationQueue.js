// 队列计时属于展示层；导入/回放不会访问持久化统计层。
export function createCelebrationQueue({show,hide,schedule=setTimeout,cancel=clearTimeout,duration=5000}) {
  const pending=[];
  let current=null,timer;
  function advance(){if(current || !pending.length)return;current=pending.shift();show(current);timer=schedule(dismiss,duration);}
  function dismiss(){if(!current)return;cancel(timer);current=null;hide();advance();}
  return {push(entry){pending.push(entry);advance();},dismiss,dispose(){cancel(timer);pending.length=0;current=null;},get current(){return current;},get pending(){return [...pending];}};
}
