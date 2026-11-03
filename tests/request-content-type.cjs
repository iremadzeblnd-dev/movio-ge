// Focused regression only: no network or database writes.
const assert = require('node:assert/strict');
Object.assign(process.env, {
  SUPABASE_URL: 'https://example.invalid', SUPABASE_PUBLISHABLE_KEY: 'test-public',
  SUPABASE_SERVICE_ROLE_KEY: 'test-server', ORDER_ALLOWED_ORIGINS: 'https://movio.test',
  TURNSTILE_SITE_KEY: 'test-site', TURNSTILE_SECRET_KEY: 'test-secret',
});
global.fetch = () => { throw Error('No upstream request expected'); };
(async () => {
  for (const name of ['orders', 'customer-account']) {
    const handler = require('../api/' + name + '.js');
    for (const [type, status] of [
      ['application/json-invalid', 415], ['application/jsonp', 415], ['text/plain', 415],
      ['application/json', 400], ['Application/JSON; charset=utf-8', 400],
    ]) {
      const res = { setHeader() {}, status(value) { this.code = value; return this; }, json() { return this; } };
      await handler({method: 'POST', headers: {origin: 'https://movio.test', 'content-type': type, authorization: 'Bearer test'}, body: {}}, res);
      assert.equal(res.code, name === 'customer-account' ? 503 : status, name + ': ' + type);
    }
  }
  console.log('PASS focused JSON media-type regression: malformed suffixes rejected; JSON parameters/case accepted; no upstream requests');
})().catch(error => { console.error(error); process.exitCode = 1; });
