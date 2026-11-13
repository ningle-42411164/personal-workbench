let order=0;
const locks=new Set();
let previousOverflow,previousFocus;
// 常驻弹窗的 DOM 顺序不等于打开顺序。按最后打开的 dialog 选择真正的顶层宿主。
export function markDialogOpened(dialog){dialog.dataset.workbenchOpened=String(++order);}
export function effectHost(document){return [...document.querySelectorAll('dialog[open]')].sort((a,b)=>Number(b.dataset.workbenchOpened??0)-Number(a.dataset.workbenchOpened??0))[0]||document.body;}
export function lockDialogPage(document,dialog){
  if(!locks.size){previousOverflow=document.body.style.overflow;previousFocus=document.activeElement;}
  locks.add(dialog);document.body.style.overflow='hidden';
}
export function unlockDialogPage(document,dialog,preferredFocus){
  locks.delete(dialog);
  if(!locks.size){document.body.style.overflow=previousOverflow;const target=preferredFocus?.isConnected&&!preferredFocus.closest('dialog:not([open])')?preferredFocus:previousFocus;if(target?.isConnected)target.focus();}
  else {const top=effectHost(document);if(!top.contains(document.activeElement)){const target=top.contains(preferredFocus)?preferredFocus:top.querySelector('h2');target?.focus();}}
}
