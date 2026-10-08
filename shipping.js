(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MovioShipping = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // Customer-facing estimate only. The RPC independently uses authoritative DB rows.
  const types = ['city', 'region', 'branch_pickup', 'village_highland'];
  const tariffs = [
    [1,6.5,10.5,6,15.5],[5,7.5,12.5,6,17.5],[10,11,16,10,21],
    [15,16,21,15,26],[20,19,26,20,31],[30,30,36,30,45],
    [50,45,65,50,80],[100,65,105,80,120],[150,80,145,110,175],
    [200,100,185,140,215],[250,120,220,170,250],[300,140,260,200,290],
    [500,220,340,280,390],[750,300,450,370,500],[1000,380,700,510,750]
  ];
  function quote(items, deliveryType) {
    let grams = 0, paidGrams = 0, paid = 0, weightKnown = true;
    for (const item of items) {
      if (!item.product || typeof item.product.freeDelivery !== 'boolean' || !Number.isInteger(item.quantity)
        || item.quantity < 1 || item.quantity > 100) return { ok:false, error:'PRODUCT_WEIGHT_REQUIRED', totalWeightKg:null, deliveryCost:null };
      if (item.product.freeDelivery) {
        if (item.product.weightKg != null && Number.isFinite(Number(item.product.weightKg)) && Number(item.product.weightKg) > 0)
          grams += Math.round(Number(item.product.weightKg) * 1000) * item.quantity;
        else weightKnown = false;
        continue;
      }
      if (!item.product || item.product.weightKg == null || !Number.isFinite(Number(item.product.weightKg))
        || Number(item.product.weightKg) <= 0 || Number(item.product.weightKg) > 999999999.999
        || Math.abs(Number(item.product.weightKg) * 1000 - Math.round(Number(item.product.weightKg) * 1000)) > 0.00001
        || typeof item.product.freeDelivery !== 'boolean' || !Number.isInteger(item.quantity)
        || item.quantity < 1 || item.quantity > 100) return { ok:false, error:'PRODUCT_WEIGHT_REQUIRED', totalWeightKg:null, deliveryCost:null };
      const lineGrams = Math.round(Number(item.product.weightKg) * 1000) * item.quantity;
      grams += lineGrams;
      paid++; paidGrams += lineGrams;
    }
    const result = { totalWeightKg:weightKnown ? grams/1000 : null, chargeableWeightKg:paidGrams/1000,
      deliveryType, deliveryCost:paid ? null : 0, bracket:null };
    if (!items.length) return { ...result, ok:false, error:'EMPTY_CART' };
    if (paidGrams > 1000000) return { ...result, ok:false, error:'DELIVERY_CONFIRMATION_REQUIRED' };
    if (!types.includes(deliveryType)) return { ...result, ok:false, error:'DELIVERY_TYPE_REQUIRED' };
    if (paid) {
      const row = tariffs.find(row => paidGrams <= row[0] * 1000);
      result.deliveryCost = row[types.indexOf(deliveryType) + 1]; result.bracket = row[0];
    }
    return { ...result, ok:true };
  }
  return { quote, types, tariffs };
});
