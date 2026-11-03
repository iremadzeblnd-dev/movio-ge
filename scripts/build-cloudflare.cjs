// Whitelisted static output only; server code and credentials stay out of assets.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'dist-cloudflare');
fs.mkdirSync(output, {recursive:true});
// Never recursively remove any directory. Unexpected leftovers fail closed.
const assets = fs.readdirSync(root, {withFileTypes:true}).filter(entry => entry.isFile()
  && /\.(?:html|css|js|svg|png|jpe?g|webp|ico)$/i.test(entry.name) && !/^preview.*\.png$/i.test(entry.name)).map(entry => entry.name);
const generated = ['_headers','_routes.json'];
for (const entry of fs.readdirSync(output)) {
  if (![...assets,...generated].includes(entry)) throw Error('Unexpected output artifact; inspect manually: '+entry);
}
for (const name of assets) fs.copyFileSync(path.join(root,name), path.join(output,name));
fs.writeFileSync(path.join(output,'_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n');
fs.writeFileSync(path.join(output,'_routes.json'), JSON.stringify({version:1,include:['/api/*'],exclude:[]},null,2)+'\n');
console.log('Prepared '+assets.length+' exact static assets; Pages Functions remain outside public output.');
