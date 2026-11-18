import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const product=process.argv[2]||JSON.parse(fs.readFileSync('release/default-product.json'));
if(!['cloud','offline','public'].includes(product))throw Error('Unknown product');
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode',product==='public'?'public':product==='offline'?'offline':'production'],{stdio:'inherit'});
const products=JSON.parse(fs.readFileSync('release/products.json'));let commit;
try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{commit=JSON.parse(fs.readFileSync('SOURCE.json')).commit;}
const out=product==='public'?'dist/public':product==='offline'?'dist/offline':'dist';
const metadata=product==='public'?JSON.parse(fs.readFileSync('release/public.json')):products[product];
fs.writeFileSync(out+'/release-info.json',JSON.stringify({product,...metadata,commit,build:'npm ci; npm run build'+(product==='public'?':public':product==='offline'?':offline':'')},null,2));

let licenses='Third-party packages retain their respective licenses.\n';for(const name of ['vue','@vue/runtime-core','@vue/runtime-dom','@vue/reactivity','@vue/shared','sortablejs','fractional-indexing','oauth4webapi','workbox-window',...(product==='public'?['@clerk/clerk-js']:[])]){for(const filename of ['LICENSE','LICENSE.md','LICENSE.txt']){const file='node_modules/'+name+'/'+filename;if(fs.existsSync(file)){licenses+='\n--- '+name+' ---\n'+fs.readFileSync(file,'utf8');break;}}}fs.writeFileSync(out+'/THIRD_PARTY_LICENSES.txt',licenses);
