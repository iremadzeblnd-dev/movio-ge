// Local catalog preview. CLI reads the real Supabase catalog by default.
// --offline explicitly enables isolated catalog/order mocks. Live order submission is disabled.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const handler = require('../api/orders.js');
const shipping = require('../shipping.js');
function createServer({offline = false} = {}) {
  const root = path.resolve(__dirname,'..');
  const products = {
    'local-paid':{id:'local-paid',name:'Local paid product',price:25.5,weightKg:10,freeDelivery:false,stock:10,stockStatus:'მარაგშია',category:'electric-scooters',active:true},
    'local-free':{id:'local-free',name:'Local free product',price:50,weightKg:null,freeDelivery:true,stock:10,stockStatus:'მარაგშია',category:'electric-bikes',active:true},
  };
  const receipts = new Map();
  if (offline) {
  // Always override inherited configuration. All outbound requests are mocked.
  Object.assign(process.env, {SUPABASE_URL:'https://offline.invalid',SUPABASE_SERVICE_ROLE_KEY:'offline-server-key',
    SUPABASE_PUBLISHABLE_KEY:'offline-public-key',TURNSTILE_SECRET_KEY:'offline-captcha-key',TURNSTILE_SITE_KEY:'offline-site-key'});
  global.fetch = async (url,options={}) => {
    if(url==='https://offline.invalid/auth/v1/user') return {ok:options.headers.Authorization==='Bearer offline-customer',json:async()=>({id:'11111111-1111-4111-8111-111111111111'})};
    if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify') return {ok:true,json:async()=>({success:JSON.parse(options.body).response==='offline-captcha',action:'checkout',hostname:'127.0.0.1'})};
    if(url!=='https://offline.invalid/rest/v1/rpc/movio_place_order') throw Error('Outbound network is disabled in offline preview');
    const p=JSON.parse(options.body), fingerprint=JSON.stringify(p);
    const old=receipts.get(p.p_checkout_token);
    const fail=message=>({ok:false,json:async()=>({message})});
    if(old) return old.fingerprint===fingerprint?{ok:true,json:async()=>old.receipt}:fail('CHECKOUT_CONFLICT');
    let subtotal=0;
    for(const item of p.p_items){
      const product=products[item.id];
      if(!product)return fail('PRODUCT_UNAVAILABLE');
      if(product.stock<item.quantity)return fail('STOCK_UNAVAILABLE');
      if(product.price!==item.expectedPrice)return fail('PRICE_CHANGED');
      if(product.weightKg!==item.expectedWeightKg||product.freeDelivery!==item.expectedFreeDelivery)return fail('SHIPPING_DATA_CHANGED');
      subtotal+=product.price*item.quantity;
    }
    const quote=shipping.quote(p.p_items.map(item=>({product:products[item.id],quantity:item.quantity})),p.p_delivery_type);
    if(!quote.ok)return fail(quote.error);
    const receipt={id:randomUUID(),number:'MOVIO-'+(100000+receipts.size),subtotal,deliveryCost:quote.deliveryCost,total:subtotal+quote.deliveryCost};
    for(const item of p.p_items)products[item.id].stock-=item.quantity;
    receipts.set(p.p_checkout_token,{receipt,fingerprint});
    return {ok:true,json:async()=>receipt};
  };
  }
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/api/orders'){
      if (!offline) {res.writeHead(503, {'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local catalog preview: checkout disabled'}));return;}
      let raw='';
      for await (const chunk of req) {raw+=chunk;if(Buffer.byteLength(raw)>20000){res.writeHead(413);res.end();return;}}
      req.body=raw||undefined;
      res.status=code=>{res.statusCode=code;return res;};
      res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));return res;};
      await handler(req,res);return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    if(offline && pathname==='/__offline/products'){
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','no-store');
      res.end(JSON.stringify(Object.values(products).map(p=>({...p,category_key:p.category,weight_kg:p.weightKg,free_delivery:p.freeDelivery,stock_status:p.stockStatus}))));return;
    }
    if(offline && pathname==='/supabaseClient.js'){
      res.setHeader('Content-Type','text/javascript');
      res.end(`window.movioSupabase={
        from:()=>({select:()=>({order:async()=>{const response=await fetch('/__offline/products');if(!response.ok)throw Error('Offline catalog unavailable');return {data:await response.json()};}})}),
        auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{},signInWithPassword:async()=>({error:{code:'invalid_credentials'}})},rpc:async()=>({data:false})};
        window.turnstile={render:()=>0,getResponse:()=>'offline-captcha',reset:()=>{}};`);return;
    }
    let filename;
    try {filename=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));}catch{res.writeHead(400);res.end();return;}
    if(!filename.startsWith(root+path.sep)||path.dirname(filename)!==root||! /\.(html|css|js|png|jpg|svg)$/.test(filename)) {res.writeHead(404);res.end();return;}
    try {
      let body=fs.readFileSync(filename);
      if(offline && filename.endsWith('.html'))body=body.toString().replace(/<script src="https:[^>]*><\/script>/g,'').replace('<body', '<body data-offline-preview="true"').replace(/(<body[^>]*>)/, '$1<p role="status">OFFLINE MOCK PREVIEW ? simulated catalog and orders; not connected to Supabase.</p>');
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}[path.extname(filename)];
      res.setHeader('Content-Type', /^(text\/|application\/json)/.test(type) ? `${type}; charset=utf-8` : type);
      res.setHeader('Cache-Control','no-store');
      res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(404);res.end();}
  });
  server.on('listening',()=>{process.env.ORDER_ALLOWED_ORIGINS=`http://127.0.0.1:${server.address().port}`;});
  return {server,products,receipts};
}
module.exports={createServer};
if(require.main===module){
  const offline = process.argv.includes('--offline');
  const {server}=createServer({offline});server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>{
    console.log(`${offline ? 'OFFLINE MOCK ONLY' : 'LIVE SUPABASE CATALOG (local checkout disabled)'}: http://127.0.0.1:${server.address().port}`);
  });
}
