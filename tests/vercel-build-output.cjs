// Run after vercel build. Inspects only local packaging, never deploys.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const output = path.resolve('.vercel/output');
const fn = path.join(output, 'functions/api/orders.func');
const config = JSON.parse(fs.readFileSync(path.join(fn, '.vc-config.json'), 'utf8'));
assert.equal(config.runtime, 'nodejs24.x'); assert.equal(config.handler, 'api/orders.js');
assert.equal(fs.readFileSync(path.join(fn, 'api/orders.js'), 'utf8'), fs.readFileSync('api/orders.js', 'utf8'), 'API artifact must match candidate source');
const routes = JSON.parse(fs.readFileSync(path.join(output, 'config.json'), 'utf8')).routes;
assert(routes.findIndex(r => r.handle === 'filesystem') >= 0);
const api404 = routes.findIndex(r => r.status === 404 && r.src?.startsWith('^/api'));
assert(api404 < 0 || routes.findIndex(r => r.handle === 'filesystem') < api404, 'Function resolution precedes API fallback');
assert(!fs.existsSync(path.join(output, 'static/api/orders.js')), 'Handler source must not be public');
const forbidden = /(?:^|\/)(?:tests|scripts|backups|\.chrome-[^/]*|\.git|\.env[^/]*)(?:\/|$)|(?:\.sql|\.pem|\.key|\.bak|\.tmp|\.md)$/i;
function walk(dir, prefix = '') { for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
  const name = prefix + item.name; assert(!forbidden.test(name), 'Excluded artifact in static build: ' + name);
  if (item.isDirectory()) walk(path.join(dir,item.name), name + '/');
} }
walk(path.join(output, 'static'));
// Check the frontend too: validating only the API can miss stale/missing gallery assets.
const publicAssets = fs.readdirSync('.').filter(name => /\.(?:html|css|js|svg|png|jpe?g|webp|ico)$/i.test(name)
  && !/^preview.*\.png$/i.test(name)); // Local screenshots are intentionally excluded by .vercelignore.
for (const name of publicAssets) {
  const built = path.join(output, 'static', name);
  assert(fs.existsSync(built), 'Missing public asset: ' + name);
  assert(fs.readFileSync(built).equals(fs.readFileSync(name)), 'Stale public asset: ' + name);
}
for (const name of publicAssets.filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(name, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|data:|tel:|mailto:)/i.test(target)) continue;
    const relative = decodeURIComponent(target.split(/[?#]/)[0]);
    if (!relative || relative.startsWith('/api/')) continue;
    assert(fs.existsSync(path.resolve(output, 'static', relative.replace(/^\//, ''))), `${name}: missing referenced asset ${relative}`);
  }
}
console.log(`PASS frontend packaging: ${publicAssets.length} exact source assets and every local HTML reference, including logo navigation and gallery scripts`);
console.log('PASS Vercel build output: exact candidate API, Node 24 function, filesystem routing before API 404, no public handler or sensitive/development artifacts; no deployment');
