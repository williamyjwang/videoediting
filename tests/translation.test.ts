import assert from 'node:assert/strict';
import {test} from 'node:test';
import type OpenAI from 'openai';
import {bilingualCaptions} from '../server/ai';
import type {Word} from '../src/shared';

const words: Word[] = [{word: 'This', start: 0, end: .3}, {word: 'means', start: .4, end: .7}, {word: 'confidence.', start: .8, end: 1.2}, {word: 'It', start: 1.3, end: 1.5}, {word: 'grows.', start: 1.6, end: 2}];
function client(reply: unknown, inspect?: (request: any) => void) {
 return {responses: {create: async (request: unknown) => {inspect?.(request); return {output_text: JSON.stringify(reply)};}}} as unknown as OpenAI;
}
test('translation sees the entire transcript together and cannot alter source timings', async () => {
 const captions = await bilingualCaptions(client({captions: [{id: '0', en: 'This means confidence.', zh: '这意味着自信。'}, {id: '1', en: 'It grows.', zh: '自信会逐渐增强。'}]}, request => {
  assert.deepEqual(JSON.parse(request.input), [{id: '0', text: 'This means confidence.'}, {id: '1', text: 'It grows.'}]);
  assert.equal(request.text.format.strict, true);
 }), words, 2);
 assert.deepEqual(captions.map(c=>[c.start,c.end]), [[0,1.2],[1.3,2]]);
 assert.equal(captions[1].zh, '自信会逐渐增强。');
});
test('missing or reordered translations fail instead of dropping subtitle cues', async () => {
 for (const captions of [[], [{id: '1', en: 'a', zh: '甲'}, {id: '0', en: 'b', zh: '乙'}]]) {
  await assert.rejects(bilingualCaptions(client({captions}), words, 2), /mismatched captions/);
 }
});
