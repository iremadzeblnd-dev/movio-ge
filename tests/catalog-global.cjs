const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const rows = ['electric-scooters', 'electric-bikes', 'quad-bikes', 'car-accessories', 'future-category'].map((category, index) => ({
  id: `fixture-${index}`, name: `Fixture ${index}`, category: 'Display label', category_key: category,
  price: 100 + index, old_price: 200 + index, old_price_visible: true, stock: 0, active: true,
}));
rows.push({ id: 'legacy-category', name: 'Legacy category fixture', category: 'ელექტრო ველოსიპედები',
  price: 150, old_price: 250, old_price_visible: true, stock: 2, active: true });
const check = async () => {
  await MovioStore.catalogReady;
  const verify = (condition, message) => { if (!condition) throw Error(message); };
  const cards = () => [...document.querySelectorAll('.managed-product')];
  const productsByCategory = MovioStore.getProducts();
  const categories = [...new Set(productsByCategory.map(product => MovioStore.getCategoryKey(product)))];
  verify(cards().length === productsByCategory.length, 'All categories render');
  verify(cards().every(card => !card.hidden), 'Default view displays all active products');
  const categoryCards = [...document.querySelectorAll('.transport-category-card[data-category-filter]')];
  verify(categoryCards.length === 3, 'Existing three category cards remain');
  for (const link of categoryCards) {
    link.click();
    verify(cards().filter(card => !card.hidden).length === productsByCategory.filter(product => MovioStore.getCategoryKey(product) === link.dataset.categoryFilter).length, 'Click category card filters assigned products');
    verify(cards().filter(card => !card.hidden).every(card => card.dataset.productCategory === link.dataset.categoryFilter), 'Category click excludes other products');
  }
  document.querySelector('[data-category-filter=""]').click();
  verify(cards().every(card => !card.hidden), 'All Products click restores every product');
  verify(MovioStore.getCategoryKey(productsByCategory.find(product => product.id === 'legacy-category')) === 'electric-bikes', 'Legacy label normalizes on catalog read');
  for (const category of categories) {
    applyCatalogFilter(category);
    const visible = cards().filter(card => !card.hidden);
    verify(visible.length === productsByCategory.filter(product => MovioStore.getCategoryKey(product) === category).length && visible.every(card => card.dataset.productCategory === category), 'Assigned category remains visible');
    const card = visible[0];
    const old = card.querySelector('.product-old-price-label');
    verify(old?.tagName === 'S' && getComputedStyle(old).textDecorationLine.includes('line-through'), 'Old price is struck through');
    verify(old.parentElement === card.querySelector('.product-price-label').parentElement, 'Prices share a row');
    card.querySelectorAll('button').forEach(button => button.remove());
    applyCatalogFilter(category);
    verify(!card.hidden, 'Filtering does not depend on purchase buttons');
  }
  const products = MovioStore.getProducts();
  MovioStore.setCatalog(products.map(product => ({ ...product, oldPriceVisible: false })));
  verify(cards().every(card => !card.querySelector('.product-old-price-label') && card.querySelector('.product-price-label')), 'Toggle off shows only current prices');
  // A later catalog update creates new products using exactly the same renderer and filter.
  const added = { ...products[0], id: 'later-product', categoryKey: 'later-category', oldPrice: 333, oldPriceVisible: true };
  MovioStore.setCatalog([...MovioStore.getProducts(), added]);
  applyCatalogFilter(added.categoryKey);
  verify(cards().filter(card => !card.hidden).length === 1 && cards().find(card => !card.hidden).querySelector('s'), 'Future product works automatically');
  MovioStore.setCatalog([{ ...added, oldPriceVisible: false }]);
  verify(cards().length === 1 && !cards()[0].hidden && !cards()[0].querySelector('s'), 'Refresh preserves filter and toggle');
  applyCatalogFilter('');
  verify(cards().every(card => !card.hidden), 'All-products filter');
};
const checkAdmin = async () => {
  await MovioStore.catalogReady;
  window.movioAdminAuthorized = true;
  const verify = (condition, message) => { if (!condition) throw Error(message); };
  const select = document.querySelector('#productCategory');
  verify(select.tagName === 'SELECT' && select.required, 'Category requires dropdown selection');
  verify(select.options.length === MovioStore.getCategories().length + 1, 'Dropdown shares category registry');
  const original = MovioStore.getProducts()[0];
  editProduct({ ...original, category: 'Technical specifications accidentally entered', categoryKey: null });
  verify(select.value === '' && document.querySelector('#productCategoryMessage').textContent.includes('Technical specifications'), 'Invalid legacy category needs explicit correction');
  for (const category of MovioStore.getCategories()) {
    editProduct({ ...original, category: category.label, categoryKey: null });
    verify(select.value === category.key, 'Legacy label preselects canonical option');
    document.querySelector('#productFreeDelivery').checked = true;
    const before = window.fixtureWrites.length;
    document.querySelector('#productForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let index = 0; index < 100 && document.querySelector('#productForm').getAttribute('aria-busy'); index++) await new Promise(resolve => setTimeout(resolve, 10));
    verify(window.fixtureWrites.length === before + 1, 'Existing product saved once');
    const row = window.fixtureWrites.at(-1);
    verify(row.id === original.id && row.category === category.key && row.category_key === category.key, 'Save preserves ID and writes matching canonical fields');
    await MovioStore.syncFromSupabase();
    const persisted = MovioStore.getProducts().find(product => product.id === original.id);
    verify(persisted.category === category.key && persisted.categoryKey === category.key, 'Changed category survives fresh database read');
  }
  editProduct(original);
  select.value = '';
  const before = window.fixtureWrites.length;
  document.querySelector('#productForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 30));
  verify(window.fixtureWrites.length === before, 'Invalid category cannot reach database');
  resetProductForm();
  verify(select.value === '', 'New product requires explicit category choice');
  for (const category of MovioStore.getCategories()) {
    resetProductForm();
    const form = document.querySelector('#productForm');
    form.hidden = false;
    document.querySelector('#productName').value = 'New category fixture';
    document.querySelector('#productPrice').value = '100';
    document.querySelector('#productFreeDelivery').checked = true;
    select.value = category.key;
    const before = window.fixtureWrites.length;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let index = 0; index < 100 && form.getAttribute('aria-busy'); index++) await new Promise(resolve => setTimeout(resolve, 10));
    verify(window.fixtureWrites.length === before + 1, 'Future product saves successfully');
    const row = window.fixtureWrites.at(-1);
    verify(row.id !== original.id && row.category === category.key && row.category_key === category.key, 'Future product receives canonical category fields');
  }
};
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name === 'admin-auth.js') { response.setHeader('Content-Type', 'text/javascript'); response.end('window.movioAdminAuthorized=true;'); return; }
  if (name === 'supabaseClient.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(`window.fixtureWrites=[];let fixtureRows=${JSON.stringify(rows)};const fixtureWrite=row=>{window.fixtureWrites.push(row);fixtureRows=fixtureRows.filter(product=>product.id!==row.id).concat(row);const query={eq:()=>query,select:async()=>({data:[{id:row.id}]})};return query;};window.movioSupabase={from:()=>({select:()=>({order:async()=>({data:structuredClone(fixtureRows)})}),update:fixtureWrite,insert:fixtureWrite}),auth:{getSession:async()=>({data:{session:{user:{id:'fixture-admin'}}}})},rpc:async()=>({data:[]})};`);
    return;
  }
  try {
    let body = fs.readFileSync(path.join(root, name));
    if (name.endsWith('.html')) body = body.toString().replace(/<script src="https:[^>]*><\/script>/g, '')
      .replace('</body>', `<script>addEventListener('load',async()=>{try{await (${(name === 'admin.html' ? checkAdmin : check).toString()})();document.body.dataset.regression='PASS';}catch(error){document.body.dataset.regression=error.message;}});</script></body>`);
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.html') ? 'text/html' : 'text/css');
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const width of [375, 1280]) for (const page of ['index.html', 'admin.html']) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'movio-global-'));
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
        '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--window-size=${width},900`,
        '--dump-dom', '--virtual-time-budget=3000', `http://127.0.0.1:${server.address().port}/${page}`,
      ], { windowsHide: true });
      let result = '';
      child.stdout.on('data', value => result += value);
      child.on('error', reject);
      child.on('close', () => resolve(result));
    });
    assert(output.includes('data-regression="PASS"'), `${page} width ${width}: ${output.match(/data-regression="[^"]*"/)?.[0] || output.slice(-1000)}`);
  }
  console.log('PASS global catalog and Admin: all categories, future products, toggle updates, strikethrough, button-independent filtering, canonical saves, legacy edits, invalid category rejection, mobile and desktop; mocked writes only');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
