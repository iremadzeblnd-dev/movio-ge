const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const clientSource=fs.readFileSync('supabaseClient.js','utf8');
for(const sdk of [undefined,{}, {createClient(){throw Error('SDK initialization failed');}}]){
  const context={window:{supabase:sdk}};
  assert.doesNotThrow(()=>vm.runInNewContext(clientSource,context));
  assert.equal(context.window.movioSupabase,null,'Missing/broken SDK fails closed without mock Auth/catalog');
}
const client={}, context={window:{supabase:{createClient:()=>client}}};
vm.runInNewContext(clientSource,context);assert.equal(context.window.movioSupabase,client);
const storeContext={window:{},localStorage:{getItem:()=>null,setItem(){}},Event};
vm.runInNewContext(fs.readFileSync('store.js','utf8'),storeContext);
const key=storeContext.window.MovioStore.getCategoryKey;
for(const [label,expected] of [['ელექტრო სკუტერები','electric-scooters'],['ელექტრო ველოსიპედები','electric-bikes'],
  ['კვადრო ციკლები','quad-bikes'],['ATV quad bikes','quad-bikes'],['მანქანის აქსესუარები','car-accessories'],
  ['electric-scooters','electric-scooters'],['Other','other']])assert.equal(key({category:label}),expected);
assert.equal(key({category:'ელექტრო ველოსიპედები',categoryKey:'electric-scooters'}),'electric-scooters','Explicit key remains authoritative');
console.log('PASS runtime guards: missing/failed/successful Supabase SDK and shared Georgian/English category normalization; isolated fixtures only');
