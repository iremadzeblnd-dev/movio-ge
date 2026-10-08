// Metadata verification only. Never connects to Supabase or applies migrations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const sql = fs.readFileSync('supabase-production-check.sql', 'utf8');
const tokens = sql.replace(/'(?:''|[^'])*'|--[^\n]*/g, match => match.startsWith("'") ? "''" : '');
assert.match(tokens.trim(), /^WITH\b/i);
assert.equal((tokens.match(/;/g) || []).length, 1, 'One statement only');
assert(!/\b(?:create|alter|drop|insert|update|delete|truncate|grant|revoke|do|call|execute|perform|set|begin|commit|rollback|copy|vacuum|refresh|nextval|setval|pg_advisory_xact_lock)\b/i.test(tokens), 'No mutable statement or side-effect function');
assert(!/\b(?:from|join)\s+(?:public|auth|movio_private)\./i.test(tokens), 'No application table reads');
assert(!/pg_authid|pg_read_file|dblink|http_request/i.test(tokens));
for (const name of ['checkout_token','request_payload','stock_restored_at','weight_kg','free_delivery','orders_read_own','order_items_read_own','orders_user_created_idx','order_items_order_idx']) assert(sql.includes(name), name);
const rows = [...sql.matchAll(/\('public\.[^']+','(\w+)','(\w+)',(?:true|false),'([a-f0-9]{32})','([^']+)','[^']*','[sv]','[^']*'\)/g)];
assert.equal(rows.length, 6, 'Every repository function contract is fingerprinted');
for (const [, name, , expected, file] of rows) {
  const source = fs.readFileSync(file, 'utf8');
  const body = source.match(new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, 'i'))[1];
  const normalized = body.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(createHash('md5').update(normalized).digest('hex'), expected, `${file}: current body fingerprint`);
}
if (process.argv.includes('--static')) {
  console.log('PASS production verification static mode: SELECT-only source, no application reads/side effects, six current function fingerprints; NO SQL executed');
  return;
}
(async () => {
  let PGlite;
  const candidates = [process.env.MOVIO_PGLITE_PATH, '@electric-sql/pglite', path.join(os.tmpdir(), 'movio-order-sql-check/node_modules/@electric-sql/pglite')].filter(Boolean);
  for (const candidate of candidates) {
    try { ({ PGlite } = require(candidate)); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  if (!PGlite) {
    console.log('PASS static verification: SELECT-only, no data reads, current function fingerprints; local PostgreSQL syntax execution skipped (PGlite unavailable)');
    return;
  }
  const db = new PGlite(); // Fresh isolated engine; no application schema fixtures.
  try {
    const result = await db.query(sql); // Only the supplied metadata SELECT.
    assert(result.rows.length > 200);
    for (const name of ['public.orders','public.products','public.order_items','movio_private.admin_users']) {
      assert(result.rows.some(row => row.check_name === name && row.status === 'FAIL'), name);
    }
    assert(result.rows.every(row => ['PASS','FAIL','REVIEW'].includes(row.status)));
    console.log(`PASS production verification: single metadata SELECT, no application reads/side effects, six current body fingerprints, local PostgreSQL syntax and missing-object handling (${result.rows.length} results); NO migrations or production access`);
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
