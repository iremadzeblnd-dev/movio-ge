const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer, rootId } = require('../scripts/dev-server.cjs');
const root = path.resolve(__dirname, '..');
function cli(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/dev-server.cjs')], {
      cwd: root, env: {...process.env, PORT: String(port)}, windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({code, output}));
  });
}
(async () => {
  const {server} = createServer();
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    const health = await (await fetch(base + '/__movio/health')).json();
    assert.deepEqual(health, {service: 'movio-local', rootId, pid: process.pid, offline: false});
    for (const page of ['/', '/admin.html']) {
      const response = await fetch(base + page);
      assert.equal(response.status, 200);
      assert((await response.text()).includes('<!doctype html>'));
    }
    const deletion = await fetch(base + '/api/customer-account', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE',password:'not-a-real-password'})});
    assert.equal(deletion.status,503,'Local preview never deletes real Supabase accounts');
    assert((await deletion.json()).error.includes('გამორთულია'));
    const conflict = await cli(port);
    assert.equal(conflict.code, 1);
    assert(conflict.output.includes(`Port ${port} is already in use`));
    assert.equal((await fetch(base + '/')).status, 200, 'Conflict leaves the existing server running');
    const invalid = await cli('invalid');
    assert.equal(invalid.code, 1);
    assert(invalid.output.includes('Invalid PORT'));
    console.log('PASS health identity, homepage/admin HTTP 200, explicit port conflict, existing process preserved, invalid PORT diagnostic');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
