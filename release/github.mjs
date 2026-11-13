import {execFileSync} from 'node:child_process';
let token=process.env.GITHUB_TOKEN;
if(!token){const credential=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','pipe']});token=credential.split('\n').find(s=>s.startsWith('password='))?.slice(9);}
if(!token)throw Error('GitHub authorization unavailable');
export async function github(route,{method='GET',body,raw,accept='application/vnd.github+json'}={}){
 const response=await fetch(route.startsWith('https://')?route:'https://api.github.com'+route,{method,headers:{Authorization:'Bearer '+token,Accept:accept,'X-GitHub-Api-Version':'2022-11-28',...(raw?{'Content-Type':'application/zip'}:body?{'Content-Type':'application/json'}:{})},body:raw??(body?JSON.stringify(body):undefined)});
 if(!response.ok){const error=new Error('GitHub '+method+' '+response.status+' '+route.split('?')[0]);error.status=response.status;throw error;}
 return accept==='application/octet-stream'?Buffer.from(await response.arrayBuffer()):response.status===204?null:response.json();
}
