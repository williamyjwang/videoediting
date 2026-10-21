import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir, mkdtemp, readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Project} from '../src/shared';

// No AI calls or browser processes. Tests persistence and private API boundaries.
await mkdir('.data', {recursive: true});
const directory = await mkdtemp(path.resolve('.data/api-smoke-'));
const password = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
const port = process.env.MCC_API_TEST_PORT || '3004';
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;
let logs = '';
async function start() {
 child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {env: {...process.env, NODE_ENV: 'production', MCC_HOST: '127.0.0.1', PORT: port, MCC_DATA_DIR: directory, MCC_ADMIN_PASSWORD: password, MCC_SESSION_SECRET: secret, MCC_OPENAI_API_KEY: '', OPENAI_API_KEY: ''}, stdio: ['ignore', 'pipe', 'pipe']});
 child.stdout!.on('data', c => logs += c); child.stderr!.on('data', c => logs += c);
 for (let i = 0; i < 100; i++) {
  if (child.exitCode !== null) throw new Error(`API stopped: ${logs}`);
  try {if ((await fetch(base + '/api/health')).ok) return;} catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
 }
 throw new Error('API did not start.');
}
async function stop() {
 if (child?.exitCode === null) {const ended = new Promise(resolve => child!.once('exit', resolve)); child.kill('SIGTERM'); await ended;}
}
try {
 await start();
 for (const url of ['/api/projects', '/media/private.mp4', '/exports/private.mp4']) assert.equal((await fetch(base + url)).status, 401);
 const post = (body: unknown, cookie = '') => ({method: 'POST', headers: {'Content-Type': 'application/json', Cookie: cookie}, body: JSON.stringify(body)});
 assert.equal((await fetch(base + '/api/login', post({password: 'wrong'}))).status, 401);
 const login = await fetch(base + '/api/login', post({password}));
 assert.equal(login.status, 200);
 const header = login.headers.get('set-cookie')!;
 for (const flag of [/HttpOnly/i, /SameSite=Strict/i, /Secure/i]) assert.match(header, flag);
 const cookie = header.split(';')[0];
 const demo = await fetch(base + '/api/demo', {method: 'POST', headers: {Cookie: cookie}});
 assert.equal(demo.status, 201); const project: Project = await demo.json();
 const media = await fetch(base + project.video.url, {headers: {Cookie: cookie}});
 assert.equal(media.status, 200); const bytes = await media.arrayBuffer();
 const form = new FormData(); form.append('video', new Blob([bytes], {type: 'video/mp4'}), 'uploaded-sample.mp4');
 const upload = await fetch(base + '/api/projects', {method: 'POST', headers: {Cookie: cookie}, body: form}); assert.equal(upload.status, 201);
 assert.equal((await upload.json()).video.name, 'uploaded-sample.mp4');
 const edit = {plan: {...project.plan!, title: 'Persisted API test'}, captions: project.captions!.map((c, i) => i ? c : {...c, zh: '已保存的中文字幕。'}), format: 'landscape', fit: 'contain', feedback: 'Keep complete explanations.'};
 const update = (value: unknown) => ({...post(value, cookie), method: 'PUT'});
 const url = base + `/api/projects/${project.id}/edit`;
 assert.equal((await fetch(url, update(edit))).status, 200);
 const invalid = {...edit, captions: edit.captions.map((c, i) => i ? {...c, start: 0} : c)};
 assert.equal((await fetch(url, update(invalid))).status, 400);
 assert.equal((await fetch(url, {...update(edit), headers: {...update(edit).headers, Origin: 'https://unrelated.example'}})).status, 403);
 assert.equal((await fetch(base + `/api/projects/${project.id}/analyze`, post({brief: '', targetSeconds: 30}, cookie))).status, 409);
 await stop(); await start();
 const returned: Project = await (await fetch(base + `/api/projects/${project.id}`, {headers: {Cookie: cookie}})).json();
 assert.equal(returned.plan?.title, edit.plan.title); assert.equal(returned.captions?.[0].zh, edit.captions[0].zh);
 assert.equal(returned.format, 'landscape'); assert.equal(returned.feedback, edit.feedback);
 assert.deepEqual(returned.captions, edit.captions, 'Rejected edits must not partially overwrite saved subtitles');
 assert.ok((await readFile(path.join(directory, 'jobs.sqlite'))).length > 0);
 console.log('PASS: production cookie flags, private media/API/download boundaries, sign-in, real file upload, atomic bilingual edits, cross-origin rejection, missing-key behavior, and persistence after server restart.');
 console.log('This API check does not verify browser sign-in, MP4 rendering, or live AI.');
} finally {await stop();}
