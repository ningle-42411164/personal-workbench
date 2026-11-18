import {build} from 'esbuild';

// An independent entry and output: this check cannot deploy or resolve private Worker bindings.
await build({
  entryPoints:['src/public/index.js'],outfile:'.build/public.js',bundle:true,format:'esm',
  platform:'neutral',conditions:['workerd','worker','browser'],mainFields:['browser','module','main'],
  external:['cloudflare:*','node:*'],target:'es2022',logLevel:'info',
});
