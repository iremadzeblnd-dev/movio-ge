// Static migration review and JS arithmetic scenarios only. Never executes SQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const shipping = require('../shipping.js');
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const sql = read('supabase-nationwide-free-shipping.sql');
const prerequisite = read('supabase-product-delivery.sql');
assert.match(prerequisite, /alter table public\.products add column if not exists free_delivery boolean not null default false;/);
assert.match(prerequisite, /weight_kg numeric\(12,3\)/);
assert.match(sql, /total_weight numeric\(16,3\) := 0;/);
assert.match(sql, /total_weight := total_weight \+ coalesce\(product\.weight_kg, 0\) \* quantity;/);
assert.match(sql, /if not product\.free_delivery and \(product\.weight_kg is null/);
assert.match(sql, /'weight_kg', product\.weight_kg, 'free_delivery', product\.free_delivery/);
// Verify the replacement keeps the original RPC intact except for the three
// intended free-delivery weight changes. No SQL parser/database is invoked.
const original = read('supabase-weight-shipping-orders.sql');
const signature = 'create or replace function public.movio_place_order(p_checkout_token uuid, p_user_id uuid,\n  p_customer jsonb, p_items jsonb, p_delivery_cost numeric, p_delivery_type text)';
const normalize = text => text.slice(text.indexOf(signature)).replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const expected = normalize(original)
  .replace('if product.weight_kg is null or product.weight_kg < 0.001 or product.weight_kg > 999999999.999 then',
    'if not product.free_delivery and (product.weight_kg is null or product.weight_kg < 0.001 or product.weight_kg > 999999999.999) then')
  .replace("if (entry->>'expectedWeightKg') is null or (entry->>'expectedWeightKg')::numeric <> product.weight_kg",
    "if (entry->>'expectedWeightKg')::numeric is distinct from product.weight_kg")
  .replace('total_weight := total_weight + product.weight_kg * quantity;',
    'total_weight := total_weight + coalesce(product.weight_kg, 0) * quantity;');
assert.equal(normalize(sql), expected, 'All other authorization, tariffs, stock, snapshots and retry logic stays unchanged');
const free = { product: { weightKg: null, freeDelivery: true }, quantity: 3 };
const paid = { product: { weightKg: 10, freeDelivery: false }, quantity: 2 };
const knownFree = { product: { weightKg: 1500, freeDelivery: true }, quantity: 1 };
for (const scenario of [
  {name:'Free without weight',items:[free],total:0,chargeable:0,rates:[0,0,0,0]},
  {name:'Paid',items:[paid],total:20,chargeable:20,rates:[19,26,20,31]},
  {name:'Mixed',items:[free,paid],total:20,chargeable:20,rates:[19,26,20,31]},
  {name:'Mixed reverse order',items:[paid,free],total:20,chargeable:20,rates:[19,26,20,31]},
  {name:'Free known and unknown weights',items:[free,knownFree],total:1500,chargeable:0,rates:[0,0,0,0]},
]) {
  // Model the reviewed COALESCE accumulator; quote verifies unchanged pricing.
  const total = scenario.items.reduce((sum,item) => sum + (item.product.weightKg ?? 0) * item.quantity, 0);
  assert.equal(total, scenario.total, scenario.name);
  assert(Number.isFinite(total));
  shipping.types.forEach((type,index) => {
    const quote = shipping.quote(scenario.items,type);
    assert.equal(quote.ok,true,scenario.name);
    assert.equal(quote.chargeableWeightKg,scenario.chargeable,scenario.name);
    assert.equal(quote.deliveryCost,scenario.rates[index],scenario.name);
  });
}
assert.equal(shipping.quote([{product:{weightKg:null,freeDelivery:false},quantity:1}],'city').ok,false);
console.log('PASS migration static review + arithmetic scenarios: prerequisite column, NULL-safe totals, free/paid/mixed carts in all destination types; other RPC logic unchanged; NO SQL executed');
