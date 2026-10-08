// Static packaging/security checks only. No provider requests or SQL execution.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const required = ['api/orders.js','orders.js','shipping.js','store.js','supabaseClient.js',
  'supabase-sync.js','script.js','admin-auth.js','admin.js','customer-auth.js',
  'index.html','cart.html','admin.html','vercel.json','.vercelignore'];
for (const file of required) assert(fs.existsSync(file), `Missing deployment file: ${file}`);
const excluded=fs.readFileSync('.vercelignore','utf8').split(/\r?\n/).map(s=>s.trim());
for(const item of ['tests/','scripts/','backups/','.chrome-*/','.git/','.vercel/',
  '.env','.env.*','*.pem','*.key','*.log','test-results/','playwright-report/'])
  assert(excluded.includes(item) || excluded.includes(item.replace(/\/$/,'')), `Sensitive/development artifact not excluded: ${item}`);
assert(!excluded.includes('api/') && !excluded.includes('*.js'), 'Checkout handler/client must be deployed');
for(const file of ['index.html','cart.html','admin.html','item.html']) {
  const html=fs.readFileSync(file,'utf8');
  assert(!/scripts\/dev-server|--offline|offline\.invalid/.test(html),`${file}: offline runtime reference`);
}
const publicFiles = fs.readdirSync('.').filter(s=>/\.(js|html|css)$/.test(s));
for(const file of publicFiles){
  const source=fs.readFileSync(file,'utf8');
  assert(!/sb_secret_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source),`${file}: privileged credential`);
  assert(!/SUPABASE_SERVICE_ROLE_KEY|TURNSTILE_SECRET_KEY/.test(source),`${file}: server credentials in public source`);
  for(const m of source.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){
    try { assert.notEqual(JSON.parse(Buffer.from(m[0].split('.')[1],'base64url')).role,'service_role',`${file}: privileged JWT`); }
    catch(error){if(error.code==='ERR_ASSERTION')throw error;}
  }
}
console.log('PASS deployment security: required API/client files, sensitive artifact exclusions, no offline runtime links or privileged credentials in public sources; NO SQL or provider requests');
