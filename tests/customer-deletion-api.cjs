// Isolated handler tests. Every upstream request is mocked; never deletes a real user.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), {Module} = require('node:module');
const endpointPath = path.resolve(__dirname,'../api/customer-account.js');
const disabledHandler = require(endpointPath);
// Exercise the retained implementation only in this mocked test module.
// The actual source and deployed endpoint remain disabled; no env bypass exists.
const source = fs.readFileSync(endpointPath,'utf8');
assert(source.includes('const ACCOUNT_DELETION_ENABLED = false;'));
const fixture = new Module(endpointPath, module);
fixture.filename = endpointPath; fixture.paths = module.paths;
fixture._compile(source.replace('const ACCOUNT_DELETION_ENABLED = false;', 'const ACCOUNT_DELETION_ENABLED = true;'),endpointPath);
const handler = fixture.exports;
const buyer = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
Object.assign(process.env, {SUPABASE_URL:'https://deletion.invalid',SUPABASE_PUBLISHABLE_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-test-only',ORDER_ALLOWED_ORIGINS:'https://movio.test'});
let mode, calls;
const json = (data, status=200) => ({ok:status>=200&&status<300,status,json:async()=>data});
global.fetch = async (url, options) => {
  calls.push({url,options});
  if (mode==='network') throw Error('upstream unavailable');
  if (url.endsWith('/auth/v1/user')) return mode==='unauthorized'?json({},401):json({id:buyer,email:'buyer@example.test',user_metadata:{admin:true}});
  if (url.endsWith('/rpc/movio_customer_deletion_check')) {
    assert.equal(options.headers.Authorization,'Bearer user-token');
    assert.deepEqual(JSON.parse(options.body),{});
    if(mode==='missing-guard')return json({message:'not installed'},404);
    if(mode==='malformed-role')return json({allowed:true});
    return json(mode!=='admin');
  }
  if (url.includes('/token?grant_type=password')) {
    assert.equal(options.headers.apikey,'public-test');
    assert.deepEqual(JSON.parse(options.body),{email:'buyer@example.test',password:'correct-password'});
    return mode==='password-fail'?json({},400):json({user:{id:mode==='wrong-user'?other:buyer},access_token:'fresh-test-token'});
  }
  if (url.endsWith('/admin/users/'+buyer)) {
    assert.equal(options.method,'DELETE');
    assert.equal(options.headers.Authorization,'Bearer server-test-only');
    assert.deepEqual(JSON.parse(options.body),{should_soft_delete:false});
    if(mode==='delete-network')throw Error('deletion unavailable');
    return mode==='delete-fail'||mode==='cleanup-fail'?json({message:'private upstream diagnostic'},500):mode==='malformed-delete'?json({}):json({id:buyer});
  }
  if (url.endsWith('/logout?scope=local')) {
    assert.equal(options.method,'POST');
    assert.equal(options.headers.apikey,'public-test');
    assert.equal(options.headers.Authorization,'Bearer fresh-test-token','Never revoke the original customer session');
    if(mode==='cleanup-fail')throw Error('provider unavailable during cleanup');
    if(mode==='cleanup-denied')return json({},403);
    return json({},204);
  }
  throw Error('Unexpected upstream URL');
};
async function run({body={password:'correct-password',confirmation:'DELETE'},headers={},method='POST'}={}, implementation=handler) {
  calls=[];
  const response={headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
  await implementation({method,headers:{origin:'https://movio.test','content-type':'application/json',authorization:'Bearer user-token',...headers},body},response);
  assert.equal(response.headers['Cache-Control'],'no-store');
  assert(!JSON.stringify(response.body).includes('server-test-only'));
  assert(!JSON.stringify(response.body).includes('private upstream diagnostic'));
  return response;
}
(async()=>{
  mode='success';const blocked=await run({},disabledHandler);
  assert.equal(blocked.statusCode,503);assert.equal(calls.length,0,'Release-disabled endpoint never reaches Auth or database');
  mode='success';let r=await run();assert.equal(r.statusCode,200);assert.deepEqual(r.body,{deleted:true,orderRecordsRetained:true});
  assert.equal(calls.filter(c=>c.options.method==='DELETE').length,1);
  assert.equal(calls.filter(c=>c.url.includes('/logout')).length,1,'Password verification session is revoked before deletion');
  assert(calls.findIndex(c=>c.url.includes('/logout')) < calls.findIndex(c=>c.options.method==='DELETE'));
  assert(!calls.some(c=>/\/orders|\/order_items/.test(c.url)),'Handler never deletes retained orders');
  for(const [test,code] of [['admin',403],['missing-guard',503],['malformed-role',403],['unauthorized',401],['password-fail',401],['wrong-user',403],['network',503]]) {
    mode=test;r=await run();assert.equal(r.statusCode,code,test);assert(!calls.some(c=>c.options.method==='DELETE'),test+' cannot delete');
  }
  for(const test of ['delete-fail','delete-network','cleanup-fail','cleanup-denied']) {
    mode=test;r=await run();assert.equal(r.statusCode,503);
    assert.equal(calls.filter(c=>c.url.endsWith('/logout?scope=local')).length,1,'Failed deletion cleans up the temporary password-verification session');
    if(test.startsWith('cleanup-'))assert(!calls.some(c=>c.options.method==='DELETE'),'Cleanup failure stops deletion');
  }
  mode='malformed-delete';r=await run();assert.equal(r.statusCode,503,'Unconfirmed deletion never reports success');
  mode='success';
  for(const options of [{method:'GET'},{headers:{origin:'https://evil.test'}},{headers:{authorization:''}},{headers:{'content-type':'text/plain'}},
    {body:{password:'correct-password',confirmation:'DELETE',userId:other}}, {body:{password:'correct-password'}}, {body:null}, {body:'{broken'}, {body:'x'.repeat(5000)}]) {
    r=await run(options);assert(r.statusCode>=400);assert.equal(calls.length,0,'Rejected input never reaches upstream');
  }
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;r=await run();assert.equal(r.statusCode,503);assert.equal(calls.length,0);
  console.log('PASS customer deletion API: verified self only, password reauth, strict confirmation/origin/input, admin/guard failures closed, server-only privilege, retained orders, sanitized errors; no real writes');
})().catch(error=>{console.error(error);process.exitCode=1});
