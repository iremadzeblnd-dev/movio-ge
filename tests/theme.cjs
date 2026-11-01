const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('theme.js','utf8');
function fixture(initial,blocked=false,page='index.html'){
 const events={},handlers={},dataset={};let saved=initial;
 const button={style:{setProperty(k,v){this[k]=v}},getBoundingClientRect:()=>({top:0,bottom:44,left:0,right:44,width:44,height:44}),setAttribute(k,v){this[k]=v},addEventListener(k,v){handlers[k]=v}};
 const controls={classList:{add(){}},children:[],append(){}};
 const document={documentElement:{dataset},readyState:'complete',querySelector:s=>s==='.site-header, .item-page-header'?{classList:{add(){}},style:{minHeight:'',paddingBottom:''},getBoundingClientRect:()=>({top:0,right:400,height:80}),querySelector:()=>controls}:null,querySelectorAll:()=>[],createElement:()=>button};
 const localStorage={getItem:()=>{if(blocked)throw Error('blocked');return saved},setItem:(k,v)=>{assert.equal(k,'movio-theme');if(blocked)throw Error('blocked');saved=v}};
 vm.runInNewContext(code,{location:{pathname:'/'+page},document,localStorage,getComputedStyle:()=>({paddingRight:'20px',paddingBottom:'10px'}),addEventListener:(k,v)=>events[k]=v});return {dataset,handlers,events,button,get saved(){return saved}};
}
for(const initial of [undefined,'invalid','dark'])assert.equal(fixture(initial).dataset.theme,'dark');
const light=fixture('light');assert.equal(light.dataset.theme,'light');light.handlers.click({stopPropagation(){}});assert.equal(light.saved,'dark');assert.equal(light.button['aria-pressed'],'false');
const blocked=fixture(null,true);blocked.handlers.click({stopPropagation(){}});assert.equal(blocked.dataset.theme,'light');blocked.handlers.click({stopPropagation(){}});assert.equal(blocked.dataset.theme,'dark');
light.events.storage({key:'movio-theme',newValue:'light'});assert.equal(light.dataset.theme,'light');light.events.storage({key:'movio-cart',newValue:'[]'});assert.equal(light.dataset.theme,'light');light.events.storage({key:'movio-theme',newValue:null});assert.equal(light.dataset.theme,'dark');
assert.deepEqual(fixture('light',false,'admin.html').dataset,{});
console.log('PASS theme preference defaults/restoration, invalid values, blocked storage, toggle accessibility state, cross-tab updates and Admin exclusion');

(async()=>{
 const calls=[],events={};const dataset={theme:'light'};let removed=0;
 const window={addEventListener:(name,fn)=>events[name]=fn,turnstile:{render:(_target,options)=>{calls.push(options.theme);return calls.length},remove:()=>removed++}};
 vm.runInNewContext(fs.readFileSync('orders.js','utf8'),{window,document:{documentElement:{dataset}},fetch:async()=>({ok:true,json:async()=>({siteKey:'fixture',deliveryRule:'weight_tariff_v1'})})});
 await window.MovioOrders.prepare();assert.deepEqual(calls,['light']);dataset.theme='dark';events['movio:themechange']();await new Promise(r=>setTimeout(r,10));assert.deepEqual(calls,['light','dark']);assert.equal(removed,1);console.log('PASS checkout verification follows selected theme; only widget repainted (mock Cloudflare)');
})().catch(e=>{console.error(e);process.exitCode=1});

const css=fs.readFileSync('theme.css','utf8');
for(const [,selector,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
 if(!selector.includes('[data-theme="light"]'))continue;
 for(const declaration of body.split(';')){
  const name=declaration.split(':')[0].trim();if(!name||name.startsWith('--'))continue;
  assert(['color','color-scheme','background','background-image','background-color','border-color','box-shadow','outline-color'].includes(name),'Theme-specific geometry declaration: '+name);
 }
}
assert(!/img\[src\*="movio-logo-/.test(fs.readFileSync('styles.css','utf8')),'Logo sizing must not depend on the theme asset URL');
console.log('PASS theme CSS changes paint properties only; logo sizing is source-independent');
