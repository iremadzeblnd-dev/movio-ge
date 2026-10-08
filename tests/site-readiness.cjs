const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pages=fs.readdirSync('.').filter(file=>file.endsWith('.html'));
for(const file of pages){
 const html=fs.readFileSync(file,'utf8');
 if(file!=='admin.html')assert(!/პროტოტიპ|დემო რეჟიმი|კატალოგის კონცეფცია/.test(html),file);
 for(const match of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)){
  const target=match[1];if(/^(?:https?:|tel:|mailto:|data:)/.test(target))continue;
  const local=decodeURIComponent(target.split(/[?#]/)[0]);if(local)assert(fs.existsSync(path.resolve(local)),`${file}: broken resource ${target}`);
 }
}
for(const page of ['delivery','contact','privacy','returns','terms'])assert(fs.existsSync(`${page}.html`));
const sql=fs.readFileSync('supabase-nationwide-free-shipping.sql','utf8');
assert(!/alter table|delete from|truncate|create policy|drop policy/i.test(sql));
const sync=fs.readFileSync('supabase-sync.js','utf8');
assert.match(sync,/\.eq\('stock', previous.stock\)\.eq\('stock_status', previous.stockStatus\)/);
assert(!sync.includes('.upsert('),'Stale product edits cannot blindly upsert stock');
assert.match(sync,/update\(\{active:false/,'Product removal preserves row for stock restoration');
assert(!/\.delete\(\)/.test(sync));
console.log('PASS website: local links/resources, no prototype claims, information pages, safe product persistence/deactivation, migration preservation; NO SQL');
