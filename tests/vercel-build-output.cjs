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
console.log('PASS Vercel build output: exact candidate API, Node 24 function, filesystem routing before API 404, no public handler or sensitive/development artifacts; no deployment');
