import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCaptions, validatePlan, type Caption, type EditPlan} from '../src/shared';
import {captionsForExport, parseSrt, toSrt} from '../src/captions';

const cues: Caption[] = [{id: 'a', start: 1, end: 3, en: 'A complete thought.', zh: '完整的意思。'}, {id: 'b', start: 4, end: 6, en: 'Keep the context.', zh: '保留上下文。'}];
test('bilingual SRT round trips content, Unicode and millisecond timing', () => {
  const original = [{...cues[0], start: 1.234, end: 3.567}, cues[1]];
  const parsed = parseSrt('\uFEFF' + toSrt(original).replace(/\n/g, '\r\n'));
  assert.deepEqual(parsed.map(({id: _, ...cue}) => cue), original.map(({id: _, ...cue}) => cue));
  assert.doesNotThrow(() => validateCaptions(parsed, 6));
  assert.throws(() => parseSrt('1\ninvalid\nHello'), /Invalid SRT/);
  assert.throws(() => parseSrt('1\n00:00:65,000 --> 00:01:10,000\nHello'), /Invalid SRT/);
  assert.equal(toSrt([{...cues[0], en: '', zh: ''}]).trim(), '');
});
test('rejects overlapping, out of order, duplicate and out-of-bounds caption cues', () => {
  assert.throws(() => validateCaptions([cues[0], {...cues[1], start: 2}], 10), /overlap/);
  assert.throws(() => validateCaptions([...cues].reverse(), 10), /order/);
  assert.throws(() => validateCaptions([cues[0], {...cues[1], id: 'a'}], 10), /unique/);
  assert.throws(() => validateCaptions(cues, 5), /inside/);
  assert.throws(() => validateCaptions([{...cues[0], end: 0.5}], 10), /inside/);
});
test('subtitle exports trim and retime captions to the actual cut sequence', () => {
  const plan: EditPlan = {title: 'Test', hook: '', segments: [{start: 2, end: 2.5, label: ''}, {start: 4, end: 6, label: ''}, {start: 1, end: 2, label: ''}]};
  const result = captionsForExport(cues, plan);
  assert.deepEqual(result.map(c => [c.start, c.end]), [[0, 0.5], [0.5, 2.5], [2.5, 3.5]]);
  assert.deepEqual(result.map(c => c.zh), [cues[0].zh, cues[1].zh, cues[0].zh]);
});
test('horizontal edits support long form while short presets retain their duration limit', () => {
  const plan: EditPlan = {title: 'Long form', hook: '', segments: [{start: 0, end: 600, label: ''}]};
  assert.doesNotThrow(() => validatePlan(plan, 600, 'landscape'));
  assert.throws(() => validatePlan(plan, 600, 'vertical'), /3 minutes/);
  assert.throws(() => validatePlan(plan, 600, 'portrait'), /3 minutes/);
});

test('subtitle QA flags speech omissions and empty languages, while allowing silent gaps', async () => {
 const {captionQuality} = await import('../src/captions');
 const words = [{word: 'First.', start: 1, end: 2}, {word: 'Later.', start: 4, end: 5}];
 assert.deepEqual(captionQuality(cues, words), []);
 assert.match(captionQuality([cues[0]], words)[0], /1 transcript word.*4.00s/);
 assert.ok(captionQuality([{...cues[0], zh: ''}], []).some(s => /one language is empty/.test(s)));
 assert.ok(captionQuality([{...cues[0], end: 1.1}], []).some(s => /too fast/.test(s)));
});
