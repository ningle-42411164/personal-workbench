// 产品输入不变时复用其证据；新的控制器提交必须单独通过针对性验证。
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {args,planFor,context,run} from './core.mjs';
import {report} from './report.mjs';
const a=args(),ctx=context(planFor(a.target,a.sha));
const controller=fileURLToPath(new URL('../',import.meta.url));
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:controller,encoding:'utf8',timeout:60000}).trim();
if(commit!==process.env.RELEASE_CONTROLLER_SHA)throw Error('控制器提交不符');
try{
 await ctx.step('controller.'+commit,()=>{
  run('npm',['ci','--ignore-scripts','--prefer-offline'],controller);
  run(process.execPath,['--test','tests/release*.test.js'],controller);
  return {passed:true,commit};
 });
 ctx.state.controller={commit,checked:true};ctx.save();
}catch(e){ctx.state.fatal='控制器验证失败：'+e.message;ctx.save();process.exitCode=1;}
report(ctx);
