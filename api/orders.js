// Vercel Node function. All privileged credentials stay in server environment variables.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const message = 'შეკვეთის გაფორმება დროებით მიუწვდომელია. კალათა შენახულია.';
class InvalidCheckout extends Error {}
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status, error) => res.status(status).json({ error });
  const env = process.env;
  const origins = (env.ORDER_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const configured = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_PUBLISHABLE_KEY
    && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY && origins.length;
  if (!configured) return reply(503, message);
  if (req.method === 'GET') return res.status(200).json({ siteKey: env.TURNSTILE_SITE_KEY, deliveryRule: 'weight_tariff_v1' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return reply(405, message); }
  if (!origins.includes(req.headers.origin)) return reply(403, message);
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reply(415, message);
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!raw || Buffer.byteLength(raw) > 20000) return reply(413, message);
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { throw new InvalidCheckout(); } // Only malformed client JSON is a definitive rejection.
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || (body.items && (!Array.isArray(body.items) || body.items.some(item => !item || typeof item !== 'object')))) throw new InvalidCheckout();
    const trim = (value, min, max) => {
      if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new InvalidCheckout();
      return value.trim();
    };
    const customer = {
      firstName: trim(body.customer?.firstName, 1, 80), lastName: trim(body.customer?.lastName, 1, 80),
      phone: trim(body.customer?.phone, 7, 30), city: trim(body.customer?.city, 1, 100),
      address: trim(body.customer?.address, 1, 500), email: trim(body.customer?.email || '', 0, 254).toLowerCase(),
    };
    if (!/^[+\d\s()-]+$/.test(customer.phone) || customer.phone.replace(/\D/g,'').length < 7
      || (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) throw new InvalidCheckout();
    if (!UUID.test(body.checkoutToken) || body.paymentMethod !== 'cash_on_delivery'
      || body.deliveryRule !== 'weight_tariff_v1'
      || !['city','region','branch_pickup','village_highland'].includes(body.deliveryType)
      || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw new InvalidCheckout();
    const items = body.items.map(item => ({ id: trim(item.id, 1, 200), quantity: item.quantity,
      expectedPrice: item.expectedPrice, expectedWeightKg: item.expectedWeightKg,
      expectedFreeDelivery: item.expectedFreeDelivery }));
    if (new Set(items.map(item => item.id)).size !== items.length || items.some(item =>
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100
      || !Number.isFinite(item.expectedPrice) || item.expectedPrice <= 0
      || (!(item.expectedFreeDelivery === true && item.expectedWeightKg === null)
        && (!Number.isFinite(item.expectedWeightKg) || item.expectedWeightKg <= 0 || item.expectedWeightKg > 999999999.999))
      || typeof item.expectedFreeDelivery !== 'boolean')) throw new InvalidCheckout();
    let userId = null;
    if (req.headers.authorization) {
      if (!/^Bearer [^\s]+$/.test(req.headers.authorization)) return reply(401, 'შედით ხელახლა ან გააგრძელეთ სტუმრის სტატუსით.');
      const auth = await request(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: req.headers.authorization },
      });
      if (!auth.ok) return reply(401, 'შედით ხელახლა ან გააგრძელეთ სტუმრის სტატუსით.');
      const user = await auth.json();
      if (!user.id) return reply(401, message);
      userId = user.id; // Never trust a user_id supplied by the browser.
    }
    const token = trim(body.turnstileToken, 1, 2048);
    const verification = await request('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
    });
    const verified = await verification.json();
    if (!verification.ok || verified.success !== true || verified.action !== 'checkout'
      || verified.hostname !== new URL(req.headers.origin).hostname) return reply(403, 'გაიარეთ უსაფრთხოების შემოწმება ხელახლა.');
    const db = await request(`${env.SUPABASE_URL}/rest/v1/rpc/movio_place_order`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ p_checkout_token: body.checkoutToken, p_user_id: userId,
        // Kept only for the existing RPC signature. Database derives delivery
        // from the locked products row; this argument is never authoritative.
        p_customer: customer, p_items: items, p_delivery_cost: null, p_delivery_type: body.deliveryType }),
    });
    const result = await db.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) return reply(503, message);
    if (!db.ok) {
      const known = {
        STOCK_UNAVAILABLE: 'მარაგი შეიცვალა. შეამოწმეთ კალათა და სცადეთ ხელახლა.',
        PRODUCT_UNAVAILABLE: 'პროდუქტი აღარ არის ხელმისაწვდომი. შეამოწმეთ კალათა.',
        PRICE_CHANGED: 'პროდუქტის ფასი შეიცვალა. განაახლეთ გვერდი და შეამოწმეთ კალათა.',
        PRODUCT_WEIGHT_REQUIRED: 'პროდუქტის წონა დასაზუსტებელია. კალათა შენახულია.',
        SHIPPING_DATA_CHANGED: 'პროდუქტის მიწოდების მონაცემები შეიცვალა. განაახლეთ გვერდი.',
        DELIVERY_CONFIRMATION_REQUIRED: '1000 კგ-ზე მეტი ტვირთის მიწოდების ფასი საჭიროებს დადასტურებას. კალათა შენახულია.',
        CHECKOUT_CONFLICT: 'შეკვეთის მონაცემები შეიცვალა. განაახლეთ გვერდი და სცადეთ ხელახლა.',
      };
      // Only a known transactional rejection is definitive. A gateway/server
      // failure may follow a committed RPC; retain the browser's retry token.
      const definitive = Object.prototype.hasOwnProperty.call(known, result.message) && !(db.status >= 500);
      return reply(definitive ? 409 : 503, definitive ? known[result.message] : message);
    }
    // An invalid upstream receipt can follow a commit. Keep the same retry token.
    if (typeof result.id !== 'string' || !result.id || !/^MOVIO-\d+$/.test(result.number)
      || ![result.subtotal, result.deliveryCost, result.total].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
      || Math.abs(result.total - result.subtotal - result.deliveryCost) > 0.001) return reply(503, message);
    // No PII, capability, raw DB error, or privileged credentials in the response.
    return res.status(200).json({ id: result.id, number: result.number, subtotal: result.subtotal,
      deliveryCost: result.deliveryCost, total: result.total });
  } catch (error) {
    return reply(error instanceof InvalidCheckout ? 400 : 503,
      error instanceof InvalidCheckout ? 'შეამოწმეთ შეკვეთის მონაცემები.' : message);
  }
};
