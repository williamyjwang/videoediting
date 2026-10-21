import {test} from 'node:test';
import assert from 'node:assert/strict';
import {durationFrames, FPS, tightenPlan, validatePlan, type EditPlan} from '../src/shared';

const plan: EditPlan = {title: 'A complete thought', hook: '', segments: [{start: 0, end: 8, label: ''}]};
test('rejects cuts outside footage and invalid or excessive durations', () => {
  assert.throws(() => validatePlan(plan, 5), /beyond/);
  assert.throws(() => validatePlan({...plan, segments: [{start: 4, end: 2, label: ''}]}, 8), /0.2/);
  assert.throws(() => validatePlan({...plan, segments: [{start: 0, end: 181, label: ''}]}, 200), /3 minutes/);
  assert.throws(() => validatePlan({...plan, title: ''}, 8));
});
test('removes a long pause while retaining speech and source boundaries', () => {
  const words = [{word: 'Hello', start: 1, end: 1.5}, {word: 'there', start: 1.7, end: 2.1}, {word: 'Welcome', start: 6, end: 7}];
  const tightened = tightenPlan(plan, words);
  assert.equal(tightened.segments.length, 2);
  for (const word of words) assert.ok(tightened.segments.some(s => s.start <= word.start && s.end >= word.end));
  assert.ok(tightened.segments[0].end < 3);
  assert.ok(tightened.segments[1].start > 5);
  assert.doesNotThrow(() => validatePlan(tightened, 8));
});
test('rounds cut boundaries consistently with source video frames', () => {
  const fractional = {...plan, segments: [{start: 0.018, end: 1.049, label: ''}, {start: 3, end: 4, label: ''}]};
  assert.equal(durationFrames(fractional), Math.round(1.049 * FPS) - Math.round(0.018 * FPS) + FPS);
});
test('retains silent/manual footage rather than producing an empty edit', () => {
  assert.deepEqual(tightenPlan(plan, []), plan);
});
