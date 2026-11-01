const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const baseline=process.argv.includes('--baseline');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 try {
  const body=baseline&&['supabase-sync.js','product-detail.js','item.html'].includes(name)
   ? require('child_process').execFileSync('git',['show','HEAD:'+name],{cwd:root}) : fs.readFileSync(path.join(root,name));
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'image/svg+xml');
  res.setHeader('Cache-Control','no-store');res.end(body);
 }catch{res.writeHead(404);res.end();}
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config=fs.readFileSync(path.join(root,'supabaseClient.js'),'utf8');
  const catalogURL=config.match(/SUPABASE_URL = "([^"]+)/)[1],publicKey=config.match(/SUPABASE_KEY = "([^"]+)/)[1];
  const catalogResponse=await fetch(catalogURL+'/rest/v1/products?select=id&active=eq.true&limit=1',{headers:{apikey:publicKey},signal:AbortSignal.timeout(10000)});
  assert(catalogResponse.ok,'Public catalog lookup succeeds');
  const [selectedProduct]=await catalogResponse.json(); assert(selectedProduct?.id,'An active product is required for live measurements');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'movio-logo-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  ], { windowsHide: true, stdio: 'ignore' });
  let ws;
  try {
    let port;
    for (let index = 0; index < 100; index++) {
      try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); break; } catch { await wait(100); }
    }
    assert(port, 'Chrome starts');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const call = pending.get(message.id); pending.delete(message.id);
      message.error ? call.reject(message.error) : call.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.detailMetrics={longTasks:[]};document.addEventListener('load',event=>{if(event.target.id==='detailImage'&&!detailMetrics.main)detailMetrics.main=performance.now();},true);
      new PerformanceObserver(list=>{for(const e of list.getEntries())detailMetrics.longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
      new MutationObserver(()=>{
        const panel=document.querySelector('#productDetail'),title=document.querySelector('#detailTitle');
        if(panel&&!panel.hidden&&title?.textContent.trim()&&!detailMetrics.visible){detailMetrics.visible=performance.now();}
        const image=document.querySelector('#detailImage');if(image&&!image.hidden&&image.complete&&image.naturalWidth&&!detailMetrics.main){detailMetrics.main=performance.now();}
        if((panel?.dataset.galleryState==='ready'||!panel?.dataset.galleryState&&document.querySelector('.product-gallery-controls')!==null)&&!detailMetrics.gallery){detailMetrics.gallery=performance.now();}
      }).observe(document,{subtree:true,attributes:true,childList:true,characterData:true});
    `});
    let requests=new Map();
    ws.addEventListener('message',event=>{
      const m=JSON.parse(event.data),p=m.params;
      if(m.method==='Network.requestWillBeSent')requests.set(p.requestId,{url:p.request.url,method:p.request.method,start:p.timestamp});
      if(m.method==='Network.responseReceived'&&requests.has(p.requestId))Object.assign(requests.get(p.requestId),{status:p.response.status,cache:!!p.response.fromDiskCache,ttfb:p.response.timing?.receiveHeadersStart});
      if(m.method==='Network.loadingFinished'&&requests.has(p.requestId))Object.assign(requests.get(p.requestId),{ms:(p.timestamp-requests.get(p.requestId).start)*1000,bytes:p.encodedDataLength});
    });
    const output=[];
    for(const width of [1280,375]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      if(process.argv.includes('--throttled')) await send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:200000,uploadThroughput:100000});
      for(let run=0;run<3;run++) {
        const href=base+'/item.html?item='+encodeURIComponent(selectedProduct.id);
        requests=new Map();
        await send('Page.navigate',{url:href});
        for(let i=0;i<600;i++){await wait(50);try{if(await evaluate(`!!window.detailMetrics?.visible||!document.querySelector('#productNotFound')?.hidden&&document.readyState==='complete'`))break;}catch{}}
        for(let i=0;i<440;i++){await wait(50);if(await evaluate(`document.querySelector('#productDetail')?.dataset.galleryState==='ready'||document.querySelector('#productDetail')?.dataset.galleryState==='error'||!document.querySelector('#productNotFound')?.hidden||!!window.detailMetrics?.visible&&!document.querySelector('#productDetail')?.dataset.galleryState&&document.querySelector('.product-gallery-controls')!==null`))break;}
        await wait(100);
        const metrics=await evaluate(`({visible:window.detailMetrics?.visible,main:window.detailMetrics?.main,gallery:window.detailMetrics?.gallery,galleryState:document.querySelector('#productDetail')?.dataset.galleryState,longTasks:window.detailMetrics?.longTasks,dom:performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd,images:[...document.images].filter(i=>!i.hidden).map(i=>({main:i.id==='detailImage',complete:i.complete,width:i.naturalWidth,inline:i.src.startsWith('data:'),length:i.getAttribute('src')?.length})),resources:performance.getEntriesByType('resource').filter(e=>/supabase|product-detail|store\.js/.test(e.name)).map(e=>({name:e.name,start:e.startTime,duration:e.duration}))})`);
        const network=[...requests.values()].filter(r=>/rest\/v1\/products|supabase-js|supabaseClient|product-detail|store\.js/.test(r.url));
        // Record failures as well as successes; do not hide network variability.
        const row={width,run,...metrics,network};output.push(row);console.log(JSON.stringify(row));const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2));}
      }
    }
    const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2));}
  } finally { ws?.close(); chrome.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>server.close());
