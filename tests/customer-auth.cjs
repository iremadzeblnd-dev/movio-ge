// Run with: node tests/customer-auth.cjs
// Real Supabase JS SDK + intercepted Auth responses. No emails, real accounts, orders or database writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const emailRequestsEnabled = !fs.readFileSync(path.join(root,'customer-auth.js'),'utf8').includes('const EMAIL_AUTH_REQUESTS_ENABLED = false;');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'movio-customer-auth-'));
const deletionRequests = [];
let deletionMode = 'fail', deletedFixture = false, adminFixture = false;
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'cart.html';
  if (name === 'api/customer-account') {
    let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
      const body=JSON.parse(raw);deletionRequests.push({body,authorization:req.headers.authorization});
      res.setHeader('Content-Type','application/json');
      if(adminFixture){res.statusCode=403;res.end(JSON.stringify({error:'Admin protected'}));return;}
      if(deletionMode==='fail'||body.password!=='SafeTest123!'){res.statusCode=503;res.end(JSON.stringify({error:'წაშლა ვერ დადასტურდა'}));return;}
      deletedFixture=true;res.end(JSON.stringify({deleted:true,orderRecordsRetained:true}));
    });return;
  }
  if (name === 'supabaseClient.js') { res.end("window.movioSupabase = window.supabase.createClient('https://auth-test.movio.invalid','test-anon-key');"); return; }
  if (name === 'supabase-sync.js') { res.end('// Isolated test fixture only; production never reads cached catalogs.\nwindow.MovioStore.setCatalog(JSON.parse(localStorage.getItem(\'movio-data-v1\')||\'{"products":[]}\').products);window.MovioStore.catalogReady=Promise.resolve();'); return; }
  try {
    let data = fs.readFileSync(path.join(root, name));
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  } catch { res.statusCode = 404; res.end(); }
});
const browser = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`], { stdio: 'ignore', windowsHide: true });
let ws;
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert(port, 'Headless Chrome must start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      message.error ? waiter.reject(message.error) : waiter.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, includeCommandLineAPI: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  const testUser = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'customer@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { first_name: 'Test', last_name: 'Customer', full_name: 'Test Customer' }, created_at: new Date().toISOString() };
  const jwt = () => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: testUser.id, aud: 'authenticated', role: 'authenticated', email: testUser.email, exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000) })).toString('base64url'), 'test-signature'].join('.');
  const session = () => ({ access_token: jwt(), refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user: testUser });
  const calls = [];
  let immediateSignup = false;
  let failNameSave = false;
  let interceptFailure;
  ws.addEventListener('message', async event => {
    const msg = JSON.parse(event.data);
    if (msg.method !== 'Fetch.requestPaused') return;
    try {
      const request = msg.params.request;
      const url = new URL(request.url);
      const body = request.postData ? JSON.parse(request.postData) : {};
      if (request.method !== 'OPTIONS') calls.push({ path: url.pathname, method: request.method, body, redirect: url.searchParams.get('redirect_to') });
      let response = {}, status = 200;
      if (request.method === 'OPTIONS') status = 204;
      else if (url.pathname === '/rest/v1/orders') response = [];
      else if (url.pathname === '/rest/v1/rpc/movio_is_admin') response = adminFixture;
      else if (url.pathname.endsWith('/signup')) {
        Object.assign(testUser.user_metadata, body.data);
        response = immediateSignup ? session() : testUser;
      } else if (url.pathname.endsWith('/token')) {
        if (deletedFixture || body.password === 'Incorrect123!') { status = 400; response = { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }; }
        else response = session();
      } else if (url.pathname.endsWith('/user')) {
        if (deletedFixture) {status=401;response={msg:'User not found'};}
        else if (request.method === 'PUT' && body.data && failNameSave) {
          status = 400; response = {error_code:'unexpected_failure',msg:'Simulated name save failure'};
        } else {
          if (request.method === 'PUT' && body.data) Object.assign(testUser.user_metadata, body.data);
          response = testUser;
        }
      }
      else if (url.pathname.endsWith('/logout')) status = 204;
      await send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, {name:'Access-Control-Allow-Headers',value:'*'}, {name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,DELETE,OPTIONS'}], body: Buffer.from(status === 204 ? '' : JSON.stringify(response)).toString('base64') });
    } catch (error) { interceptFailure = error; }
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://auth-test.movio.invalid/*' }] });
  // Local catalog fixture only, never injected into the production Supabase client.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(!localStorage.getItem('movio-data-v1'))localStorage.setItem('movio-data-v1',JSON.stringify({products:[{id:'auth-test-product',name:'Test product',category:'electric-scooters',price:100,weightKg:1,freeDelivery:true,stock:5,active:true}],orders:[{number:'PRIVATE-OTHER-ORDER',customerEmail:'other@example.test',createdAt:'2026-10-06',total:5}]}));` });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function ready(expression) {
    for (let i=0;i<200;i++) {
      try { if(await evaluate(expression)) return; } catch {}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw Error('Timed out: '+expression);
  }
  async function navigate(page='index.html') {
    await send('Page.navigate',{url:base+'/'+page});
    await ready(`document.readyState!=='loading' && !!document.querySelector('#customerResetForm') && !!window.MovioCustomerAuth`);
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
  async function submit(id, values) {
    await evaluate(`(()=>{const form=document.getElementById(${JSON.stringify(id)});for(const [name,value] of Object.entries(${JSON.stringify(values)}))form.elements[name].value=value;form.requestSubmit();})()`);
    await ready(`!document.querySelector('#${id}').hasAttribute('aria-busy')`);
  }
  const login = () => submit('customerLoginForm',{email:'customer@example.test',password:'SafeTest123!'});
  for (const width of [1280,390,320]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await navigate();
    await evaluate(`window.movioSupabase.auth.signOut({scope:'local'})`);
    await click('#accountButton');
    assert(await evaluate(`document.querySelector('#accountDialog').open`));
    if (emailRequestsEnabled) {
    await click('[data-auth-mode="register"]');
    assert.deepEqual(await evaluate(`[...document.querySelector('#customerRegisterForm').elements].filter(e=>e.tagName==='INPUT').map(e=>e.name)`), ['firstName','lastName','email','password','passwordRepeat']);
    const bounds = await evaluate(`(()=>{const r=document.querySelector('#accountDialog').getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};})()`);
    assert(bounds.left>=0 && bounds.right<=width && bounds.height<=844);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#registerPassword')).fontSize`),'16px');
    const before=calls.length;
    await submit('customerRegisterForm',{firstName:'Test',lastName:'Customer',email:'customer@example.test',password:'SafeTest123!',passwordRepeat:'Mismatch123!'});
    assert.equal(calls.length,before,'Mismatched passwords never sent to Auth');
    await submit('customerRegisterForm',{firstName:'Test',lastName:'Customer',email:'CUSTOMER@example.test',password:'SafeTest123!',passwordRepeat:'SafeTest123!'});
    const signup=calls.filter(c=>c.path.endsWith('/signup')).at(-1);
    assert.equal(signup.body.email,'customer@example.test');
    assert.deepEqual(signup.body.data,{first_name:'Test',last_name:'Customer',full_name:'Test Customer'});
    assert.equal(signup.redirect,base+'/index.html?account=confirmed');
    assert.equal(await evaluate(`window.MovioCustomerAuth.getCurrentUser()`),null,'Unconfirmed signup cannot impersonate logged-in user');
    } else {
      const before=calls.length;
      assert(await evaluate(`document.querySelector('.auth-switch').hidden && document.querySelector('#forgotPasswordButton').hidden && document.querySelector('#customerRegisterForm').hidden && !document.querySelector('#customerLoginForm').hidden`),'Only unavailable email features hidden; existing login remains');
      assert(await evaluate(`MovioCustomerAuth.register({firstName:'Test',lastName:'Customer',email:'customer@example.test',password:'SafeTest123!'}).then(()=>false,()=>true)`));
      assert(await evaluate(`MovioCustomerAuth.requestPasswordReset('customer@example.test').then(()=>false,()=>true)`));
      assert.equal(calls.length,before,'Disabled email requests never reach Supabase');
    }
    await submit('customerLoginForm',{email:'customer@example.test',password:'Incorrect123!'});
    assert(await evaluate(`document.querySelector('#authMessage').textContent.includes('არასწორია')`));
    await login();
    assert.equal(await evaluate(`document.querySelector('#accountLabel').textContent`),'Test');
    assert(await evaluate(`!document.querySelector('#accountDialog').open`));
    await send('Page.reload');
    await ready(`document.readyState!=='loading' && document.querySelector('#accountLabel')?.textContent==='Test'`);
    for (const theme of ['dark', 'light']) {
      if (await evaluate('document.documentElement.dataset.theme') !== theme) await click('.theme-toggle');
      const originalMetadata = testUser.user_metadata;
      const firstName = 'ალექსანდრეგრძელისახელი';
      testUser.user_metadata = { first_name: firstName, last_name: 'მომხმარებელი' };
      await evaluate(`MovioCustomerAuth.login({email:'customer@example.test',password:'SafeTest123!'})`);
      assert.equal(await evaluate(`document.querySelector('#accountLabel').textContent`), firstName, 'Label follows authenticated metadata');
      const layout = await evaluate(`(()=>{const label=document.querySelector('#accountLabel'),selectors=['.wordmark','.header-search','.header-cart-link','#accountButton','.theme-toggle'];const boxes=selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]});return {visible:getComputedStyle(label).display!=='none',overflow:document.documentElement.scrollWidth>innerWidth,boxes}})()`);
      assert(layout.visible && !layout.overflow, JSON.stringify({width,theme,layout}));
      for(let i=0;i<layout.boxes.length;i++)for(let j=i+1;j<layout.boxes.length;j++){
        const a=layout.boxes[i],b=layout.boxes[j];
        assert(a[2]<=b[0]+.1||b[2]<=a[0]+.1||a[3]<=b[1]+.1||b[3]<=a[1]+.1, `Header overlap: ${width}px ${theme}`);
      }
      testUser.user_metadata = {full_name:'მარიამ მომხმარებელი'};
      await evaluate(`MovioCustomerAuth.login({email:'customer@example.test',password:'SafeTest123!'})`);
      assert.equal(await evaluate(`document.querySelector('#accountLabel').textContent`),'მარიამ','Legacy full-name metadata supplies first name');
      testUser.user_metadata = {};
      await evaluate(`MovioCustomerAuth.login({email:'customer@example.test',password:'SafeTest123!'})`);
      assert.equal(await evaluate(`document.querySelector('#accountLabel').textContent`),'ანგარიში','Missing name uses account fallback');
      testUser.user_metadata = originalMetadata;
      await evaluate(`MovioCustomerAuth.login({email:'customer@example.test',password:'SafeTest123!'})`);
    }
    await click('#accountButton');
    await click('#accountMenu [data-account-action="profile"]');
    assert(await evaluate(`document.querySelector('#accountProfilePanel').textContent.includes('Customer') && document.querySelector('#accountProfilePanel').textContent.includes('customer@example.test')`));
    await click('.customer-account-tabs [data-account-action="orders"]');
    await ready(`!!document.querySelector('.customer-orders-empty')`);
    assert.equal(await evaluate(`document.querySelector('.customer-orders-empty').textContent`),'შეკვეთები ჯერ არ გაქვთ.');
    assert(!(await evaluate(`document.querySelector('#accountOrdersPanel').textContent`)).includes('PRIVATE-OTHER-ORDER'));
    await click('.customer-account-tabs [data-account-action="logout"]');
    await ready(`document.querySelector('#accountLabel').textContent==='ანგარიში'`);
    await send('Page.reload');
    await ready(`document.readyState!=='loading' && !!document.querySelector('#customerResetForm')`);
    assert.equal(await evaluate(`window.MovioCustomerAuth.getCurrentUser()`),null);
    assert.equal(await evaluate(`document.querySelector('#accountLabel').textContent`),'ანგარიში','Signed-out label survives refresh');
    await click('#accountButton');
    if (emailRequestsEnabled) {
    await click('#forgotPasswordButton');
    await submit('customerResetForm',{email:'customer@example.test'});
    const reset=calls.filter(c=>c.path.endsWith('/recover')).at(-1);
    assert.equal(reset.body.email,'customer@example.test');
    assert.equal(reset.redirect,base+'/index.html?account=recovery');
    }
    await navigate(`index.html?account=recovery#access_token=${jwt()}&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=recovery`);
    await ready(`document.querySelector('#accountDialog').open && !document.querySelector('#customerNewPasswordForm').hidden`);
    await submit('customerNewPasswordForm',{password:'ChangedTest123!',passwordRepeat:'ChangedTest123!'});
    assert(calls.some(c=>c.path.endsWith('/user') && c.method==='PUT' && c.body.password==='ChangedTest123!'));
    await new Promise(resolve=>setTimeout(resolve,100));
    assert(await evaluate(`document.querySelector('#customerNewPasswordForm').hidden`),'Recovery does not reopen after successful password update');
    await navigate('cart.html');
    await ready(`!!window.MovioCustomerAuth.getCurrentUser()`);
    assert.equal(await evaluate(`document.querySelector('#customerName').value`),'Test Customer');
    await evaluate(`const f=document.querySelector('#customerName');f.value='Manual customer';f.dispatchEvent(new Event('input',{bubbles:true}));window.MovioCustomerAuth.prefillCheckout()`);
    assert.equal(await evaluate(`document.querySelector('#customerName').value`),'Manual customer');
    await evaluate(`window.MovioCustomerAuth.logout()`);
    assert.equal(await evaluate(`document.querySelector('#customerName').value`),'Manual customer','Logout preserves manually entered guest details');
    // Guest cart and checkout never call login or require an account.
    const authBefore=calls.length;
    await evaluate(`cartStore.add('auth-test-product');document.querySelector('#deliveryType').value='city';renderCart();document.querySelector('#desktopCartCheckout').click()`);
    assert(await evaluate(`!!document.querySelector('.cart-item') && !document.querySelector('#checkoutForm').hidden && !document.querySelector('#accountDialog').open`));
    assert.equal(calls.length,authBefore,'Guest purchase controls require no Auth operation');
    assert.equal(await evaluate(`localStorage.getItem('movio-customer-users-v1')`),null);
    assert.equal(await evaluate(`localStorage.getItem('movio-customer-session-v1')`),null);
    console.log(`PASS ${width}px: email-request availability gate, existing login, reload persistence, profile, orders, logout, valid recovery update, prefill, guest shopping`);
  }
  if (emailRequestsEnabled) {
  immediateSignup = true;
  const signupResult = await evaluate(`MovioCustomerAuth.register({firstName:'ნინო',lastName:'მომხმარებელი',email:'customer@example.test',password:'SafeTest123!'})`);
  assert.equal(signupResult.confirmationRequired, false);
  assert.equal(await evaluate(`document.querySelector('#accountLabel').textContent`), 'ნინო', 'Session-bearing signup updates the header immediately');
  await send('Page.reload');
  await ready(`document.readyState!=='loading' && document.querySelector('#accountLabel')?.textContent==='ნინო'`);
  await evaluate(`MovioCustomerAuth.logout()`);
  assert.equal(await evaluate(`document.querySelector('#accountLabel').textContent`), 'ანგარიში');
  console.log('PASS immediate signup name, refresh persistence, metadata fallback, both themes and long-name responsive layouts');
  }
  for (const width of [1280,390,320]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await navigate();
    await evaluate(`MovioCustomerAuth.logout().then(()=>sessionStorage.clear())`);
    testUser.user_metadata = {};
    await click('#accountButton');
    await login();
    await ready(`document.querySelector('#accountDialog').open&&!document.querySelector('#customerNameForm').hidden`);
    const bounds = await evaluate(`(()=>{const r=document.querySelector('#accountDialog').getBoundingClientRect();return [r.left,r.right,r.height]})()`);
    assert(bounds[0]>=0&&bounds[1]<=width&&bounds[2]<=844);
    await click('#customerNameLater');
    await send('Page.reload');
    await ready(`document.readyState!=='loading'&&!!document.querySelector('#customerNameForm')&&!!MovioCustomerAuth.getCurrentUser()`);
    await new Promise(resolve=>setTimeout(resolve,100));
    assert(await evaluate(`!document.querySelector('#accountDialog').open`),'Dismissed name prompt does not repeat on refresh');
    await click('#accountButton');
    await ready(`document.querySelector('#accountDialog').open&&!document.querySelector('#customerNameForm').hidden`);
    failNameSave = true;
    await submit('customerNameForm',{firstName:'ანა'});
    assert(await evaluate(`document.querySelector('#accountDialog').open&&document.querySelector('#authMessage').textContent.includes('შენახვა ვერ მოხერხდა')&&document.querySelector('#accountLabel').textContent==='ანგარიში'`),'Failed save never pretends to save a name');
    failNameSave = false;
    await submit('customerNameForm',{firstName:'ანა'});
    await ready(`document.querySelector('#accountLabel').textContent==='ანა'&&!document.querySelector('#accountDialog').open`);
    assert.equal(testUser.user_metadata.first_name,'ანა');
    const save=calls.filter(c=>c.path.endsWith('/user')&&c.method==='PUT'&&c.body.data).at(-1);
    assert.deepEqual(save.body.data,{first_name:'ანა',full_name:'ანა'},'Only customer name metadata is written');
    assert(!save.body.app_metadata && !save.body.role && !save.body.password, 'No privilege or credential updates');
    await send('Page.reload');
    await ready(`document.readyState!=='loading'&&document.querySelector('#accountLabel')?.textContent==='ანა'`);
    assert(await evaluate(`!document.querySelector('#accountDialog').open`),'Saved name is not requested again');
    // The cached session has Ana; the Auth server now has newer legacy metadata.
    testUser.user_metadata = {firstName:'ლუკა',lastName:'მომხმარებელი'};
    await send('Page.reload');
    await ready(`document.readyState!=='loading'&&document.querySelector('#accountLabel')?.textContent==='ლუკა'`);
    testUser.user_metadata = {profile:{first_name:'თამარი',last_name:'მომხმარებელი'}};
    await send('Page.reload');
    await ready(`document.readyState!=='loading'&&document.querySelector('#accountLabel')?.textContent==='თამარი'`);
    await evaluate(`MovioCustomerAuth.logout()`);
    const count=calls.length;
    assert(await evaluate(`MovioCustomerAuth.saveFirstName('სხვა').then(()=>false,()=>true)`),'Signed-out users cannot save a name');
    assert.equal(calls.length,count,'No metadata request without an authenticated customer');
    assert.equal(await evaluate(`document.querySelector('#accountLabel').textContent`),'ანგარიში');
    console.log(`PASS ${width}px: one-time missing-name prompt, retry after failed save, secure metadata write, refresh persistence, stale-session refresh, legacy profile fields, logout`);
  }
  for(const width of [1280,390,320])for(const theme of ['dark','light']){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    deletedFixture=false;adminFixture=false;deletionMode='fail';testUser.user_metadata={first_name:'ნინო',last_name:'მომხმარებელი'};
    await navigate();await click('#accountButton');await login();
    if(await evaluate('document.documentElement.dataset.theme')!==theme)await click('.theme-toggle');
    await click('#accountButton');await click('#accountMenu [data-account-action="profile"]');
    if (fs.readFileSync(path.join(root,'customer-auth.js'),'utf8').includes('const ACCOUNT_DELETION_ENABLED = false;')) {
      const count=deletionRequests.length;
      assert(await evaluate(`!document.querySelector('#customerDeleteButton')`),'Disabled deletion has no profile action');
      assert(await evaluate(`MovioCustomerAuth.deleteAccount({password:'SafeTest123!',confirmation:'წაშლა'}).then(()=>false,()=>true)`),'Direct client deletion is disabled');
      assert.equal(deletionRequests.length,count,'Disabled customer deletion sends no request');
      assert(await evaluate(`!!MovioCustomerAuth.getCurrentUser()`),'Account remains signed in');
      console.log(`PASS ${width}px ${theme}: deletion disabled, no button/request, account usable`);
      continue;
    }
    await ready(`!!document.querySelector('#customerDeleteButton')`);await click('#customerDeleteButton');
    const before=deletionRequests.length;
    await submit('customerDeleteForm',{password:'SafeTest123!',confirmation:'არა'});
    assert.equal(deletionRequests.length,before,'Typed confirmation is required');
    await click('#customerDeleteCancel');assert.equal(deletionRequests.length,before,'Cancel sends no deletion request');
    await ready(`!!document.querySelector('#customerDeleteButton')`);await click('#customerDeleteButton');
    await submit('customerDeleteForm',{password:'SafeTest123!',confirmation:'წაშლა'});
    assert(await evaluate(`document.querySelector('#accountDialog').open&&!document.querySelector('#customerDeleteForm').hidden&&!!MovioCustomerAuth.getCurrentUser()`),'Failed delete keeps account usable');
    assert.equal(await evaluate(`document.querySelector('#deletePassword').value`),'','Password cleared after failure');
    const layout=await evaluate(`(()=>{const r=document.querySelector('#accountDialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()`);
    assert(layout,'Deletion dialog fits '+width+'px '+theme);
    await evaluate(`localStorage.setItem('movio-cart',JSON.stringify([{id:'auth-test-product',quantity:1}]));sessionStorage.setItem('movio-pending-checkout',JSON.stringify({userId:MovioCustomerAuth.getCurrentUser().id,input:{customer:{address:'Private'}}}));sessionStorage.setItem('movio-name-prompted:'+MovioCustomerAuth.getCurrentUser().id,'1')`);
    deletionMode='success';await submit('customerDeleteForm',{password:'SafeTest123!',confirmation:'წაშლა'});
    assert.equal(await evaluate(`document.querySelector('#accountLabel').textContent`),'ანგარიში');
    assert.equal(await evaluate(`MovioCustomerAuth.getCurrentUser()`),null);
    assert.equal(await evaluate(`sessionStorage.getItem('movio-pending-checkout')`),null);
    assert.equal(await evaluate(`localStorage.getItem('sb-auth-test-auth-token')`),null);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('movio-cart')).length`),1);
    assert.equal(await evaluate(`document.documentElement.dataset.theme`),theme);
    assert.deepEqual(deletionRequests.at(-1).body,{password:'SafeTest123!',confirmation:'DELETE'});
    assert(deletionRequests.at(-1).authorization.startsWith('Bearer '));
    await send('Page.reload');await ready(`document.readyState!=='loading'&&!!window.MovioCustomerAuth`);
    assert.equal(await evaluate(`MovioCustomerAuth.getCurrentUser()`),null);
    assert.equal(await evaluate(`localStorage.getItem('sb-auth-test-auth-token')`),null,'Refresh stays signed out');
    console.log(`PASS ${width}px ${theme}: deletion confirmation/cancel/failure/success, password cleared, local session/retry cleanup, cart/theme retained, refresh signed out`);
  }
  deletedFixture=false;adminFixture=true;deletionMode='success';await navigate();await click('#accountButton');await login();
  await click('#accountButton');await click('#accountMenu [data-account-action="profile"]');await new Promise(resolve=>setTimeout(resolve,100));
  assert(await evaluate(`!document.querySelector('#customerDeleteButton')`),'Admin is not offered customer deletion');
  assert(await evaluate(`MovioCustomerAuth.deleteAccount({password:'SafeTest123!',confirmation:'წაშლა'}).then(()=>false,()=>true)`),'Server rejection cannot be bypassed by frontend calls');
  assert(await evaluate(`!!MovioCustomerAuth.getCurrentUser()`),'Admin remains signed in');
  assert(!interceptFailure, String(interceptFailure));
  assert.deepEqual(errors,[],'No browser exceptions');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{ws?.close();chrome.kill();server.close();});
