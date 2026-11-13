const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
export const equal=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
