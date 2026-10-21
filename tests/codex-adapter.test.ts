import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('Codex adapter sends long input through stdin, passes its server binding, and cleans up', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mcc-codex-test-'));
  const previous = {PATH: process.env.PATH, MCC_DATA_DIR: process.env.MCC_DATA_DIR, MCC_OPENAI_API_KEY: process.env.MCC_OPENAI_API_KEY};
  try {
    const bin = path.join(directory, 'bin'); await mkdir(bin);
    const data = path.join(directory, 'data'); await mkdir(path.join(data, 'tmp'), {recursive: true});
    await writeFile(path.join(bin, 'codex'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (!args.includes('-') || args[args.indexOf('--sandbox')+1] !== 'read-only') process.exit(2);
if (process.env.CODEX_API_KEY !== 'test-only-placeholder') process.exit(3);
if (!JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1])).properties.segments) process.exit(4);
let input=''; process.stdin.setEncoding('utf8'); process.stdin.on('data', value=>input+=value);
process.stdin.on('end',()=>{
 if (!input.includes('large-transcript-marker') || input.length < 150000) process.exit(5);
 fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify({title:'Reviewed thought',hook:'',segments:[{start:0,end:2,label:''}]}));
});
`, {mode: 0o755});
    process.env.PATH = `${bin}:${previous.PATH}`; process.env.MCC_DATA_DIR = data; process.env.MCC_OPENAI_API_KEY = 'test-only-placeholder';
    const {planWithCodex} = await import('../server/codex');
    const result = await planWithCodex('Create a coherent edit.', {transcript: 'large-transcript-marker '.repeat(8000)});
    assert.deepEqual(result, {title: 'Reviewed thought', hook: '', segments: [{start: 0, end: 2, label: ''}]});
    assert.deepEqual(await readdir(path.join(data, 'tmp')), []);
  } finally {
    for (const [key, value] of Object.entries(previous)) {if (value === undefined) delete process.env[key]; else process.env[key] = value;}
    await rm(directory, {recursive: true, force: true});
  }
});
