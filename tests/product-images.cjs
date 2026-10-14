const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const rows = ['electric-scooters', 'electric-bikes', 'quad-bikes', 'car-accessories', 'future-category'].map((category, index) => ({
  id: `fixture-${index}`, name: `Fixture ${index}`, category: 'Display label', category_key: category,
  price: 100 + index, old_price: 200 + index, old_price_visible: true, stock: 0, active: true,
}));
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
rows[0].images=[png+'#one',png+'#two',png+'#three']; rows[0].image=rows[0].images[1]; rows[0].description='Preserve me'; rows[1].image=png;
rows.push({ id: 'legacy-category', name: 'Legacy category fixture', category: 'ელექტრო ველოსიპედები',
  price: 150, old_price: 250, old_price_visible: true, stock: 2, active: true });
const check = async () => {
  await MovioStore.catalogReady;
  if (new URLSearchParams(location.search).has('refresh-check')) return;
  const verify = (ok, label) => { if (!ok) throw Error(label); };
  const thumbs = [...document.querySelectorAll('.product-gallery-thumbnails button')];
  if (new URLSearchParams(location.search).get('item') === 'fixture-1') {
    verify(thumbs.length === 1 && document.querySelector('.product-gallery-thumbnails').hidden, 'Legacy single image gallery');
    verify(!document.querySelector('#detailImage').hidden, 'Legacy image visible');
    return;
  }
  verify(thumbs.length === 3, 'Three thumbnails');
  const product = MovioStore.getProducts().find(p => String(p.id) === new URLSearchParams(location.search).get('item'));
  const images = product.images;
  const mainIndex = images.indexOf(product.image);
  for (const button of [...thumbs, ...document.querySelectorAll('.product-gallery-controls button')]) {
    button.scrollIntoView({block:'center'});
    const rect = button.getBoundingClientRect();
    verify(rect.width > 0 && rect.height > 0 && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button') === button, 'Gallery controls visible and reachable rather than covered by main image');
  }
  const image = document.querySelector('#detailImage');
  verify(image.getAttribute('src') === images[mainIndex], 'Main image selected');
  thumbs[0].click(); verify(image.getAttribute('src') === images[0], 'Thumbnail navigation');
  document.querySelector('.product-gallery-controls button:last-child').click(); verify(image.getAttribute('src') === images[1], 'Next navigation');
  document.querySelector('.product-gallery-controls button:first-child').click(); verify(image.getAttribute('src') === images[0], 'Previous navigation');
  const swipe = (type, x) => { const event = new Event(type); Object.defineProperty(event, type === 'touchstart' ? 'touches' : 'changedTouches', {value:[{clientX:x,clientY:100}]}); image.dispatchEvent(event); };
  swipe('touchstart', 200); swipe('touchend', 80); verify(image.getAttribute('src') === images[1], 'Mobile swipe');
  verify(document.documentElement.scrollWidth <= innerWidth, 'Responsive gallery');
  if (!sessionStorage.getItem('detail-page-refreshed')) {
    sessionStorage.setItem('detail-page-refreshed', 'true');
    location.reload();
    await new Promise(() => {});
  }
};
const checkAdmin = async () => {
  await MovioStore.catalogReady; window.movioAdminAuthorized = true;
  if (new URLSearchParams(location.search).has('refresh-check')) return;
  const verify = (ok, label) => { if (!ok) throw Error(label); };
  const original = MovioStore.getProducts()[0];
  verify(MovioStore.getProducts()[1].images.length === 1, 'Legacy single image');
  editProduct(original);
  const input = document.querySelector('#productImage');
  verify(input.multiple, 'Multiple selection');
  const addFiles = async () => {
    const bytes = await (await fetch(original.images[0].split('#')[0])).blob();
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'new.png', {type:'image/png'}));
    transfer.items.add(new File([bytes], 'duplicate.png', {type:'image/png'}));
    input.files = transfer.files; input.dispatchEvent(new Event('change'));
    for (let i=0; i<1000 && imageReadPending; i++) await new Promise(resolve=>setTimeout(resolve,10));
  };
  await addFiles(); verify(productImages.length === 4, 'Adds one unique image while preserving existing three');
  await addFiles(); verify(productImages.length === 4, 'Duplicate upload ignored');
  const rejectFile = async file => {
    const before = JSON.stringify(productImages);
    const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    for (let i=0; i<1000 && imageReadPending; i++) await new Promise(resolve=>setTimeout(resolve,10));
    verify(JSON.stringify(productImages) === before && document.querySelector('#productImageMessage').textContent.length > 0, 'Invalid file rejected without changing draft');
  };
  await rejectFile(new File(['bad'], 'bad.svg', {type:'image/svg+xml'}));
  await rejectFile(new File(['bad'], 'bad.png', {type:'image/png'}));
  await rejectFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {type:'image/png'}));
  document.querySelector('.admin-image-entry:nth-child(4) button:first-of-type').click();
  verify(mainProductImage === productImages[3], 'Select main');
  document.querySelector('.admin-image-entry:nth-child(4) button:nth-of-type(2)').click();
  verify(mainProductImage === productImages[2], 'Reorder keeps selected main');
  document.querySelector('.admin-image-entry:first-child button:last-child').click(); verify(productImages.length === 3, 'Remove individual image');
  document.querySelector('#productWeightKg').value = '2';
  const submit = async () => {
    document.querySelector('#productForm').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
    for (let i=0; i<100 && document.querySelector('#productForm').hasAttribute('aria-busy'); i++) await new Promise(resolve=>setTimeout(resolve,10));
  };
  await submit(); const saved = window.fixtureWrites.at(-1);
  verify(saved.id === original.id && saved.images.length === 3, 'Edit updates same product');
  verify(saved.price === original.price && saved.stock === original.stock && saved.description === original.description, 'Unrelated fields preserved');
  await MovioStore.syncFromSupabase(); const refreshed = MovioStore.getProducts().find(p=>p.id===original.id);
  verify(JSON.stringify(refreshed.images) === JSON.stringify(saved.images) && refreshed.image === saved.image, 'Database read preserves order and main image');
  editProduct(refreshed); verify(document.querySelectorAll('.admin-image-entry').length===3,'Reloaded editor thumbnails');
  const reloadedPage = document.createElement('iframe'); reloadedPage.hidden = true;
  const pageLoaded = new Promise(resolve => reloadedPage.addEventListener('load', resolve, {once:true}));
  reloadedPage.src = 'admin.html?refresh-check=1'; document.body.append(reloadedPage);
  await pageLoaded; await reloadedPage.contentWindow.MovioStore.catalogReady;
  const afterReload = reloadedPage.contentWindow.MovioStore.getProducts().find(p => p.id === original.id);
  verify(JSON.stringify(afterReload.images) === JSON.stringify(saved.images) && afterReload.image === saved.image, 'Fresh page preserves persisted images and main image');
  reloadedPage.remove();
  const detailPage = document.createElement('iframe'); detailPage.style.width = '100%'; detailPage.style.height = '900px';
  const detailLoaded = new Promise(resolve => detailPage.addEventListener('load', resolve, {once:true}));
  detailPage.src = `item.html?item=${encodeURIComponent(original.id)}&refresh-check=1`; document.body.append(detailPage);
  await detailLoaded; await detailPage.contentWindow.MovioStore.catalogReady;
  // Wait for detail initialization after its catalog promise resolves.
  await new Promise(resolve => setTimeout(resolve, 20));
  verify(detailPage.contentDocument.querySelectorAll('.product-gallery-thumbnails button').length === saved.images.length, 'Admin saved images reach fresh storefront page');
  verify(detailPage.contentDocument.querySelector('#detailImage').getAttribute('src') === saved.image, 'Fresh storefront selects saved main image');
  detailPage.remove();
  document.querySelector('#newProductButton').click();
  document.querySelector('#productName').value='New multiple image product'; document.querySelector('#productCategory').value='electric-scooters';
  document.querySelector('#productPrice').value='100'; document.querySelector('#productWeightKg').value='1';
  await addFiles(); productImages.push(original.images[1]); renderProductImages(); await submit();
  verify(window.fixtureWrites.at(-1).id !== original.id && window.fixtureWrites.at(-1).images.length===2, `New product multiple images: count=${productImages.length}, pending=${imageReadPending}, message=${document.querySelector('#productMessage').textContent}, imageMessage=${document.querySelector('#productImageMessage').textContent}, savedCount=${window.fixtureWrites.at(-1).images.length}`);
  window.movioAdminAuthorized = false;
  let denied=false; try { await MovioStore.saveProduct({...original,images:[]}); } catch { denied=true; }
  verify(denied, 'Unauthorized image mutation denied');
};
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name === 'admin-auth.js') { response.setHeader('Content-Type', 'text/javascript'); response.end('window.movioAdminAuthorized=true;'); return; }
  if (name === 'supabaseClient.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(`window.fixtureWrites=[];let fixtureRows=JSON.parse(sessionStorage.getItem('image-fixture-rows')||'null')||${JSON.stringify(rows)};const fixtureWrite=row=>{window.fixtureWrites.push(row);fixtureRows=fixtureRows.filter(product=>product.id!==row.id).concat(row);sessionStorage.setItem('image-fixture-rows',JSON.stringify(fixtureRows));const query={eq:()=>query,select:async()=>({data:[{id:row.id}]})};return query;};window.movioSupabase={from:()=>({select:()=>({order:async()=>({data:structuredClone(fixtureRows)})}),update:fixtureWrite,insert:fixtureWrite}),auth:{getSession:async()=>({data:{session:{user:{id:'fixture-admin'}}}})},rpc:async()=>({data:[]})};`);
    return;
  }
  try {
    let body = fs.readFileSync(path.join(root, name));
    if (name.endsWith('.html')) body = body.toString().replace(/<script src="https:[^>]*><\/script>/g, '')
      .replace('</body>', `<script>addEventListener('load',async()=>{try{await (${(name === 'admin.html' ? checkAdmin : check).toString()})();document.body.dataset.regression='PASS';}catch(error){document.body.dataset.regression=error.message;}});</script></body>`);
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.html') ? 'text/html' : 'text/css');
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
(async () => {
  const savedCatalog = process.argv.includes('--saved-catalog');
  if (savedCatalog) {
    const source = fs.readFileSync(path.join(root, 'supabaseClient.js'), 'utf8');
    const url = source.match(/SUPABASE_URL = "([^"]+)"/)[1];
    const key = source.match(/SUPABASE_KEY = "([^"]+)"/)[1];
    const response = await fetch(`${url}/rest/v1/products?select=*&active=eq.true`, {headers:{apikey:key}});
    assert(response.ok, `Read-only catalog request: ${response.status}`);
    const products = await response.json();
    rows.splice(0, rows.length, ...products.filter(p => Array.isArray(p.images) && p.images.length === 3));
    assert(rows.length, 'Saved product with three images exists');
    console.log(`Read-only saved catalog: ${rows.length} three-image product(s); no mutations`);
  }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const pages = savedCatalog ? rows.map(p => `item.html?item=${encodeURIComponent(p.id)}`) : ['item.html?item=fixture-0', 'item.html?item=fixture-1', 'admin.html'];
  for (const width of [375, 1280]) for (const page of pages) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'movio-global-'));
    // Poll real browser time: virtual-time dump-dom can outrun Image.decode().
    const child = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
      '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    ], {windowsHide:true,stdio:'ignore'});
    let ws;
    try {
      let port;
      for(let i=0;i<100;i++) {
        try { port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]); break; }
        catch { await new Promise(resolve=>setTimeout(resolve,100)); }
      }
      assert(port, 'Chrome started');
      const target=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
      ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
      let id=0; const pending=new Map();
      ws.addEventListener('message',event=>{ const msg=JSON.parse(event.data); if(!msg.id)return; const task=pending.get(msg.id); pending.delete(msg.id); msg.error?task.reject(msg.error):task.resolve(msg.result); });
      const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/${page}`});
      let result;
      for(let i=0;i<200;i++) {
        await new Promise(resolve=>setTimeout(resolve,100));
        const state=await send('Runtime.evaluate',{expression:'document.body?.dataset.regression',returnByValue:true});
        result=state.result.value; if(result)break;
      }
      assert.equal(result,'PASS',`${page} width ${width}: ${result || 'Browser checks timed out'}`);
    } finally { ws?.close(); child.kill(); }

  }
  console.log(savedCatalog ? 'PASS actual saved product images: visible/reachable controls, main image, thumbnails, previous/next, swipe and page reload at mobile/desktop widths; read-only catalog' : 'PASS multiple product images: new/existing products, deduplication, removal, reorder, main image, fresh catalog read, legacy compatibility, authorization, thumbnail/previous/next/swipe navigation, mobile and desktop; mocked writes only');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
