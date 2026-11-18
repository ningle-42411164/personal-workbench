import {execFileSync} from 'node:child_process';
import {request} from './http.mjs';
let localToken;
export function credential(){
 if(process.env.GITHUB_TOKEN)return process.env.GITHUB_TOKEN;
 if(process.env.GITHUB_ACTIONS)throw Error('工作流缺少 GITHUB_TOKEN');
 if(!localToken){const value=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});localToken=value.split('\n').find(s=>s.startsWith('password='))?.slice(9);}
 if(!localToken)throw Error('GitHub 授权不可用');return localToken;
}
export async function github(route,{method='GET',body,raw,accept='application/vnd.github+json',token,timeout=30000,attempts}={}){
 const url=route.startsWith('https://')?route:'https://api.github.com'+route;
 if(!['api.github.com','uploads.github.com'].includes(new URL(url).hostname))throw Error('拒绝向非 GitHub API 发送授权');
 return request(url,{method,timeout,attempts,binary:accept==='application/octet-stream',headers:{Authorization:'Bearer '+(token??credential()),Accept:accept,'X-GitHub-Api-Version':'2022-11-28',...(raw?{'Content-Type':'application/zip'}:body?{'Content-Type':'application/json'}:{})},body:raw??(body?JSON.stringify(body):undefined)});
}
export async function optional(route,options){try{return await github(route,options)}catch(e){if(e.status===404)return null;throw e;}}
