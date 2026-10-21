import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {durationFrames, type Project} from '../src/shared';
import {extractAudio} from '../server/media';

const base = process.env.MCC_TEST_ORIGIN || 'http://127.0.0.1:3001';
async function call(route: string, options?: RequestInit) {
  const response = await fetch(base + route, options);
  assert.ok(response.ok, `${route}: ${response.status} ${response.ok ? '' : await response.text()}`);
  return response.json();
}
const demo: Project = await call('/api/demo', {method: 'POST'});
const data = new FormData();
data.append('video', new Blob([await readFile(path.resolve('.data/media', path.basename(demo.video.url)))]), 'upload-test.mp4');
const uploaded: Project = await call('/api/projects', {method: 'POST', body: data});
assert.equal(uploaded.video.duration, 6);
const invalid = await fetch(`${base}/api/projects/${uploaded.id}/plan`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...demo.plan, segments: [{start: 0, end: 99, label: ''}]})});
assert.equal(invalid.status, 400);
await call(`/api/projects/${uploaded.id}/plan`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(demo.plan)});
const foreign = await fetch(`${base}/api/projects/${uploaded.id}/render`, {method: 'POST', headers: {Origin: 'https://unrelated.example'}});
assert.equal(foreign.status, 403);
const musicPath = path.resolve('.data/tmp/smoke-music.mp3');
await extractAudio(path.resolve('.data/media', path.basename(demo.video.url)), musicPath);
const music = new FormData();
music.append('music', new Blob([await readFile(musicPath)]), 'sample-music.mp3');
const withMusic: Project = await call(`/api/projects/${demo.id}/music`, {method: 'POST', body: music});
assert.equal(withMusic.music?.kind, 'music');
await call(`/api/projects/${demo.id}/render`, {method: 'POST'});
let finished: Project = demo;
const deadline = Date.now() + 240_000;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 1000));
  finished = await call(`/api/projects/${demo.id}`);
  if (finished.status === 'idle') break;
}
assert.equal(finished.status, 'idle', 'Render timed out');
assert.equal(finished.error, undefined, finished.error || 'Render should complete without an error');
assert.ok(finished.exportUrl);
const response = await fetch(base + finished.exportUrl);
assert.ok(response.ok);
const file = path.resolve('.data/smoke-export.mp4');
await writeFile(file, Buffer.from(await response.arrayBuffer()));
const {stdout} = await promisify(execFile)('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
const probe = JSON.parse(stdout);
const video = probe.streams.find((s: {codec_type: string}) => s.codec_type === 'video');
assert.equal(video.codec_name, 'h264');
assert.equal(video.width, 1080); assert.equal(video.height, 1920);
assert.ok(Math.abs(Number(probe.format.duration) - durationFrames(demo.plan!) / 30) < 0.2);
assert.ok(probe.streams.some((s: {codec_type: string}) => s.codec_type === 'audio'));
console.log('PASS: real upload, invalid-cut rejection, cross-origin protection, music upload, Remotion cuts/captions/logo render, H.264 1080×1920 MP4, mixed audio, and expected duration.');
console.log(`Export: ${file}`);
