// Server-only customer self-deletion. Never accepts a target account ID.
const message = 'ანგარიშის წაშლა ვერ დადასტურდა. სცადეთ ხელახლა ან დაგვიკავშირდით.';
const request = (url, options) => fetch(url, {...options, signal: AbortSignal.timeout(8000)});
// Release gate: re-enable only after the owner confirms lawful retention rules.
const ACCOUNT_DELETION_ENABLED = false;
module.exports = async function handler(req, res, runtimeEnv = process.env) {
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status, error) => res.status(status).json({error});
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, message); }
  if (!ACCOUNT_DELETION_ENABLED) return reply(503, 'ანგარიშის თვითმომსახურებით წაშლა დროებით გამორთულია. მოთხოვნისთვის დაგვიკავშირდით.');
  const env = runtimeEnv;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.ORDER_ALLOWED_ORIGINS) return reply(503, message);
  if (!env.ORDER_ALLOWED_ORIGINS.split(',').map(value => value.trim()).includes(req.headers.origin)) return reply(403, message);
  if (String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') return reply(415, message);
  if (!/^Bearer [^\s]{1,8192}$/.test(req.headers.authorization || '')) return reply(401, 'ანგარიშის წასაშლელად გაიარეთ ავტორიზაცია.');
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!raw || new TextEncoder().encode(raw).byteLength > 4096) return reply(413, message);
    let body;
    try { body = JSON.parse(raw); } catch { return reply(400, message); }
    if (!body || Array.isArray(body) || Object.keys(body).some(key => !['password','confirmation'].includes(key))
      || body.confirmation !== 'DELETE' || typeof body.password !== 'string' || !body.password || body.password.length > 1024) return reply(400, 'დაადასტურეთ წაშლა და შეიყვანეთ მიმდინარე პაროლი.');
    const headers = {apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: req.headers.authorization};
    const verified = await request(`${env.SUPABASE_URL}/auth/v1/user`, {headers});
    if (!verified.ok) return reply(verified.status === 401 || verified.status === 403 ? 401 : 503, message);
    const user = await verified.json();
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(user.id || '') || !user.email) return reply(401, message);
    // Database preflight verifies ownership, admin exclusion, retention FK and guard installation.
    const ready = await request(`${env.SUPABASE_URL}/rest/v1/rpc/movio_customer_deletion_check`, {
      method: 'POST', headers: {...headers, 'Content-Type': 'application/json'}, body: '{}',
    });
    if (!ready.ok) return reply(ready.status === 403 ? 403 : 503, 'ამ ანგარიშის წაშლა მიუწვდომელია. დაგვიკავშირდით.');
    if (await ready.json() !== true) return reply(403, 'ადმინისტრატორის ანგარიშის წაშლა ამ ფუნქციით დაუშვებელია.');
    // Re-authenticate on the server; do not trust JWT timestamps or browser confirmation alone.
    const reauth = await request(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: {apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify({email: user.email, password: body.password}),
    });
    if (!reauth.ok) return reply(reauth.status === 400 || reauth.status === 401 ? 401 : 503, 'პაროლის შემოწმება ვერ მოხერხდა. სცადეთ ხელახლა.');
    const fresh = await reauth.json();
    let temporaryToken = null;
    if (typeof fresh?.access_token === 'string' && /^[^\s]{1,8192}$/.test(fresh.access_token)
      && `Bearer ${fresh.access_token}` !== req.headers.authorization) temporaryToken = fresh.access_token;
    // Password verification creates a separate session. Revoke it before
    // deleting or replying, using only its token and local scope. The customer's
    // original session remains intact if any later step fails.
    if (temporaryToken) {
      const revoked = await request(`${env.SUPABASE_URL}/auth/v1/logout?scope=local`, {
        method: 'POST', headers: {apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${temporaryToken}`},
      });
      if (!revoked.ok) return reply(503, message);
    }
    if (fresh?.user?.id !== user.id || !temporaryToken) return reply(403, message);
    // A BEFORE DELETE guard rechecks admin status and preserves orders atomically.
    const deleted = await request(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'DELETE', headers: {apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({should_soft_delete: false}),
    });
    if (!deleted.ok) return reply(503, message);
    const removed = await deleted.json();
    if ((removed?.id || removed?.user?.id) !== user.id) return reply(503, message);
    return res.status(200).json({deleted: true, orderRecordsRetained: true});
  } catch { return reply(503, message); } // Never log passwords, tokens, identities or upstream responses.
};
