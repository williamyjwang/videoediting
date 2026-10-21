import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir, mkdtemp, readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import type {Project} from '../src/shared';

await mkdir('.data', {recursive: true});
const directory = await mkdtemp(path.resolve('.data/cloud-smoke-'));
const port = process.env.MCC_CLOUD_TEST_PORT || '3003';
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
let server: ChildProcess;
let logs = '';
async function start() {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {env: {...process.env, NODE_ENV: 'test', PORT: port, MCC_DATA_DIR: directory, MCC_ADMIN_PASSWORD: password, MCC_SESSION_SECRET: secret}, stdio: ['ignore', 'pipe', 'pipe']});
  server.stdout!.on('data', chunk => logs += chunk.toString()); server.stderr!.on('data', chunk => logs += chunk.toString());
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Server stopped: ${logs}`);
    try {if ((await fetch(base + '/api/health')).ok) return;} catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start.');
}
async function stop() {
  if (server && server.exitCode === null) {const exit = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exit;}
}
await start();
const browser = await chromium.launch({executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
try {
  assert.equal((await fetch(base + '/api/projects')).status, 401);
  assert.equal((await fetch(base + '/media/private.mp4')).status, 401);
  assert.equal((await fetch(base + '/exports/private.mp4')).status, 401);
  const wrong = await fetch(base + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: 'wrong'})});
  assert.equal(wrong.status, 401);
  const context = await browser.newContext({viewport: {width: 1360, height: 1000}});
  const page = await context.newPage();
  const exceptions: string[] = []; page.on('pageerror', e => exceptions.push(e.message));
  await page.goto(base);
  await page.getByLabel('Studio password').fill(password);
  await page.getByRole('button', {name: 'Enter your studio'}).click();
  await page.getByRole('heading', {name: 'Start with your footage'}).waitFor();
  await page.getByRole('button', {name: 'Explore with a sample'}).click();
  await page.getByLabel('Project title').waitFor();
  const id = await page.evaluate(() => localStorage.getItem('mcc-project'));
  assert.ok(id);
  const queued = page.waitForResponse(r => r.url().endsWith(`/api/projects/${id}/render`) && r.request().method() === 'POST');
  await page.getByRole('button', {name: 'Render MP4'}).click(); assert.equal((await queued).status(), 202);
  assert.deepEqual(exceptions, []);
  await context.close(); // No browser session is left polling the project.
  await stop();
  await start(); // Same disk, new process: pending/interrupted work must recover.
  const login = await fetch(base + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password})});
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  assert.match(login.headers.get('set-cookie')!, /HttpOnly/i);
  assert.match(login.headers.get('set-cookie')!, /SameSite=Strict/i);
  let result: Project | undefined;
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    result = await (await fetch(`${base}/api/projects/${id}`, {headers: {Cookie: cookie}})).json();
    if (result?.status === 'idle') break;
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  assert.equal(result?.status, 'idle', 'Render did not finish');
  assert.equal(result?.error, undefined, result?.error || 'Render should succeed');
  assert.ok(result?.exportUrl);
  assert.equal((await fetch(base + result.exportUrl)).status, 401);
  const download = await fetch(base + result.exportUrl, {headers: {Cookie: cookie}});
  assert.equal(download.status, 200); assert.ok((await download.arrayBuffer()).byteLength > 1000);
  const fresh = await browser.newContext(); const returned = await fresh.newPage();
  await returned.goto(base); await returned.getByLabel('Studio password').fill(password); await returned.getByRole('button', {name: 'Enter your studio'}).click();
  await returned.getByRole('button', {name: 'Saved projects'}).click();
  await returned.getByRole('button', {name: /MCC studio sample.*Ready to download/}).click();
  await returned.getByRole('link', {name: 'Download your finished MP4'}).waitFor();
  await returned.screenshot({path: path.join(directory, 'returned-to-finished-project.png'), fullPage: true});
  await fresh.close();
  assert.ok((await readFile(path.join(directory, 'jobs.sqlite'))).length > 0);
  console.log('PASS: private sign-in/media/downloads, browser closed, server restarted, durable queued render completed, and a new browser session found/downloaded the result.');
  console.log(`Evidence: ${directory}`);
} finally {await browser.close(); await stop();}
