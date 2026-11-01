const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('supabase-sync.js','utf8');
async function run() {
 let allowed=false, session=null, writes=0, roleCalls=0, rpcError=false;
 const window={movioAdminAuthorized:false};
 const catalog=[];
 const store=window.MovioStore={getProducts:()=>catalog,getCategoryKey:()=>"electric-scooters",validateProduct:p=>p,setCatalog(){},saveProduct:p=>{catalog.push(p);return p},deleteProduct:id=>{catalog.splice(catalog.findIndex(p=>p.id===id),1)}};
 window.movioSupabase={auth:{getSession:async()=>({data:{session}})},rpc:async()=>{roleCalls++;return rpcError?{error:{message:'offline'}}:{data:allowed}},from:()=>({
 select:()=>({order:async()=>({data:[]})}),
 insert:row=>{writes++;return {select:async()=>({data:[{id:row.id,updated_at:'fixture'}]})}},
 update:()=>{writes++;const q={eq:()=>q,select:async()=>({data:[{id:'fixture'}]})};return q}
 })};
 vm.runInNewContext(source,{window,console,setTimeout,clearTimeout,AbortController});
 const p={id:'fixture',name:'Fixture',price:100,stock:3};
 assert.throws(()=>store.saveProduct(p),/authorization/);assert.throws(()=>store.deleteProduct(p.id),/authorization/);assert.equal(writes,0);
 window.movioAdminAuthorized=true;
 await assert.rejects(()=>store.saveProduct(p),/session/);assert.equal(writes,0);
 session={user:{id:'customer'}};
 await assert.rejects(()=>store.saveProduct(p),/authorization/);await assert.rejects(()=>store.deleteProduct(p.id),/authorization/);assert.equal(writes,0);
 allowed=true;rpcError=true;await assert.rejects(()=>store.saveProduct(p),/authorization/);assert.equal(writes,0);
 rpcError=false;await store.saveProduct(p);assert.equal(writes,1);await store.saveProduct({...p,price:200});assert.equal(writes,2);await store.deleteProduct(p.id);assert.equal(writes,3);
 allowed=false;await assert.rejects(()=>store.deleteProduct(p.id),/authorization/);assert.equal(writes,3);assert(roleCalls>=7);
 console.log('PASS per-operation role checks: guests, customers, forged frontend flags, revoked role and RPC errors denied; allowed admin create/edit/delete preserved (mock backend)');
}
run().catch(e=>{console.error(e);process.exitCode=1});
