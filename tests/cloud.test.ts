import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {JobQueue} from '../server/queue';
import {signSession, validSession} from '../server/auth';
import type {Project} from '../src/shared';

const project: Project = {id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', createdAt: '2026-10-20', video: {id: 'video', name: 'test.mp4', url: '/media/test.mp4', duration: 10, kind: 'video'}, status: 'idle', brief: '', targetSeconds: 5, words: []};

test('queued jobs survive a process/database restart and are claimed once', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mcc-queue-'));
  try {
    const file = path.join(directory, 'jobs.sqlite');
    const first = new JobQueue(file);
    first.enqueue('render', project);
    assert.throws(() => first.enqueue('analyze', project), /already queued/);
    first.close();
    const second = new JobQueue(file);
    second.recover();
    const claimed = second.claim(); assert.equal(claimed?.kind, 'render');
    assert.equal(second.claim(), undefined);
    second.close();
    const third = new JobQueue(file);
    third.recover();
    const retried = third.claim(); assert.equal(retried?.id, claimed?.id); assert.equal(retried?.attempts, 2);
    third.close();
    const fourth = new JobQueue(file); fourth.recover();
    assert.equal(fourth.claim(), undefined);
    assert.match(fourth.latestError(project.id)!, /interrupted/);
    fourth.enqueue('render', project);
    assert.ok(fourth.claim()); fourth.close();
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('completed jobs unlock their project and do not run again', () => {
  const queue = new JobQueue(':memory:');
  try {
    const id = queue.enqueue('render', project); queue.claim(); queue.complete(id);
    assert.equal(queue.active(project.id), undefined); queue.recover(); assert.equal(queue.claim(), undefined);
    queue.enqueue('analyze', project); assert.equal(queue.claim()?.kind, 'analyze');
  } finally {queue.close();}
});

test('sessions reject wrong signatures, expiry, tampering and malformed tokens', () => {
  const secret = 'test-only-session-key-which-is-long-enough';
  const session = signSession(secret, 10000);
  assert.equal(validSession(session, secret, 5000), true);
  assert.equal(validSession(session, secret, 10000), false);
  assert.equal(validSession(session, 'wrong-key', 5000), false);
  assert.equal(validSession(session.replace('10000.', '20000.'), secret, 5000), false);
  assert.equal(validSession('malformed', secret), false);
});
