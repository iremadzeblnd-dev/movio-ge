const assert = require('node:assert/strict');
const shipping = require('../shipping.js');
const item = (weightKg, freeDelivery = false, quantity = 1) => ({product: {weightKg, freeDelivery}, quantity});
for (const [weight, ...prices] of shipping.tariffs) {
  for (const [index, type] of shipping.types.entries()) {
    for (const free of [false, true]) {
      const lines = [item(weight, free)];
      const before = JSON.stringify(lines);
      assert.equal(shipping.quoteReturn(lines, type).minCost, prices[index]);
      assert.equal(shipping.quoteReturn(lines, type).maxCost, prices[index]);
      assert.equal(JSON.stringify(lines), before, 'Return estimate never changes original delivery flags');
    }
  }
}
assert.equal(shipping.quoteReturn([item(40,true),item(8)],'city').minCost,45);
assert.equal(shipping.quote([item(40,true),item(8)],'city').deliveryCost,11,'Outward mixed-cart charge remains unchanged');
assert.equal(shipping.quoteReturn([item(45,true,2)],'city').minCost,65);
assert.equal(shipping.quote([item(45,true,2)],'city').deliveryCost,0);
const range = shipping.quoteReturn([item(45,true,2)],'');
assert.deepEqual([range.minCost,range.maxCost],[65,120]);
for(const weight of [null,0,-1,Infinity,0.0001])assert.equal(shipping.quoteReturn([item(weight,true)],'city').error,'PRODUCT_WEIGHT_REQUIRED');
assert.equal(shipping.quoteReturn([item(600,true,2)],'city').error,'DELIVERY_CONFIRMATION_REQUIRED');
assert.equal(shipping.quoteReturn([],'city').error,'EMPTY_CART');
console.log('PASS return estimates: exact existing tariffs for free/paid items, whole-cart/quantity weight, range without route, original delivery unchanged, no mutation, unknown/oversized weights fail closed');
