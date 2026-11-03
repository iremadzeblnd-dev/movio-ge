// Persistent local preview, independent of the invoking terminal. No dependencies.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { rootId } = require('./dev-server.cjs');
const base = 'http://127.0.0.1:4173';
const root = path.resolve(__dirname, '..');
const logPath = path.join(root, 'tmp', 'local-server.log');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function health() {
  try {
    const response = await fetch(`${base}/__movio/health`, {signal: AbortSignal.timeout(750)});
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}
const owned = status => status?.service === 'movio-local' && status.rootId === rootId && Number.isInteger(status.pid);
async function verify() {
  for (const page of ['/', '/admin.html']) {
    const response = await fetch(base + page, {signal: AbortSignal.timeout(2000)});
    if (!response.ok || !(await response.text()).includes('<!doctype html>')) throw Error(`Preview check failed: ${page}`);
  }
}
async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--restart')) throw Error('Usage: node scripts/start-local.cjs [--restart]');
  let status = await health();
  if (process.argv.includes('--restart') && owned(status)) {
    process.kill(status.pid, 'SIGTERM');
    for (let attempt = 0; attempt < 40 && await health(); attempt++) await wait(100);
    status = await health();
    if (status) throw Error('Previous preview did not stop. No additional server was started.');
  }
  if (owned(status) && !status.offline) {
    await verify();
    console.log(`MOVIO is already running (PID ${status.pid}).\n${base}/\n${base}/admin.html`);
    return;
  }
  if (status) throw Error('Port 4173 belongs to another preview or offline mode. Use --restart only for this project; other processes are never stopped.');
  fs.mkdirSync(path.dirname(logPath), {recursive: true});
  const log = fs.openSync(logPath, 'a');
  let child;
  try {
    child = spawn(process.execPath, [path.join(__dirname, 'dev-server.cjs')], {
      cwd: root, env: {...process.env, PORT: '4173'},
      detached: true, windowsHide: true, stdio: ['ignore', log, log],
    });
  } finally { fs.closeSync(log); }
  let startupError;
  let exited = false;
  child.on('error', error => { startupError = error; });
  child.on('exit', () => { exited = true; });
  child.unref();
  for (let attempt = 0; attempt < 60; attempt++) {
    if (startupError) throw startupError;
    status = await health();
    if (owned(status) && !status.offline) {
      await verify();
      console.log(`MOVIO started in the background (PID ${status.pid}).\n${base}/\n${base}/admin.html\nLog: ${logPath}\nRestart: node scripts/start-local.cjs --restart`);
      return;
    }
    if (exited) throw Error(`Server exited during startup. Port 4173 may be occupied. See ${logPath}`);
    await wait(100);
  }
  throw Error(`Server did not become ready. See ${logPath}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
