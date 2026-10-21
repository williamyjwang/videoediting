import assert from 'node:assert/strict';
import {test} from 'node:test';
import type OpenAI from 'openai';
import {bilingualCaptions, captionGroups, generateEdit} from '../server/ai';
import {durationFrames, FPS, type Project, type Word} from '../src/shared';

const words: Word[] = [{word: 'This', start: 0, end: .3}, {word: 'means', start: .4, end: .7}, {word: 'confidence.', start: .8, end: 1.2}, {word: '它', start: 1.3, end: 1.5}, {word: '会增强。', start: 1.6, end: 2}];
function client(reply?: unknown, inspect?: (request: any) => void) {
 return {responses: {create: async (request: any) => {
  inspect?.(request);
  const input = JSON.parse(request.input);
  return {output_text: JSON.stringify(reply || {captions: input.cues.map((c: any) => ({id: c.id, en: 'Faithful English.', zh: '自然的中文字幕。'}))})};
 }}} as unknown as OpenAI;
}
test('mixed-language subtitles see full context, receive a review pass, and retain source timing', async () => {
 const requests: any[] = [];
 const captions = await bilingualCaptions(client(undefined, r => requests.push(r)), words, 2);
 assert.equal(requests.length, 2);
 const initial = JSON.parse(requests[0].input), review = JSON.parse(requests[1].input);
 assert.deepEqual(initial.sourceTranscript, [{id: '0', text: 'This means confidence.'}, {id: '1', text: '它会增强。'}]);
 assert.equal(review.draftCaptions.length, 2);
 assert.match(requests[1].instructions, /QUALITY REVIEW/);
 assert.match(requests[0].instructions, /North American/); assert.match(requests[0].instructions, /cultural references/);
 assert.equal(requests[0].text.format.strict, true);
 assert.deepEqual(captions.map(c=>[c.start,c.end]), [[0,1.2],[1.3,2]]);
 assert.ok(captions.every(c=>c.en && c.zh));
});
test('missing, reordered or blank translations fail instead of dropping subtitle cues', async () => {
 for (const captions of [[], [{id: '1', en: 'a', zh: '甲'}, {id: '0', en: 'b', zh: '乙'}], [{id: '0', en: '', zh: '甲'}, {id: '1', en: 'b', zh: '乙'}]]) {
  await assert.rejects(bilingualCaptions(client({captions}), words, 2));
 }
});
test('long translation uses bounded batches with whole-video context across batch boundaries', async () => {
 const longWords = Array.from({length: 85}, (_, i) => ({word: `Thought ${i}.`, start: i * 6, end: i * 6 + 2}));
 const requests: any[] = [];
 const captions = await bilingualCaptions(client(undefined, r=>requests.push(JSON.parse(r.input))), longWords, 600);
 assert.equal(captions.length, 85); assert.equal(requests.length, 6);
 assert.ok(requests.every(r=>r.cues.length <= 40 && r.sourceTranscript.length === 85));
 assert.equal(requests[2].previousCaptions.length, 20);
 assert.deepEqual(captions.map(c=>c.id), longWords.map((_,i)=>String(i)));
});
test('completes a missing language without overwriting user-corrected text', async () => {
 const existing = [{id: 'manual', start: 0, end: 2, en: 'My corrected wording.', zh: ''}];
 const captions = await bilingualCaptions(client(), words, 2, existing);
 assert.equal(captions[0].en, existing[0].en); assert.ok(captions[0].zh);
 assert.deepEqual([captions[0].start,captions[0].end],[0,2]);
});
test('Chinese caption groups stay short and do not overlap at timestamp boundaries', () => {
 const input = Array.from({length: 60}, (_,i)=>({word: '中',start:i*.1,end:i*.1+.12}));
 const groups=captionGroups(input);
 assert.ok(groups.every(c=>c.en.length<=10));
 for(let i=1;i<groups.length;i++) assert.ok(groups[i].start>=groups[i-1].end);
});
const project: Project = {id: 'test', createdAt: '', video: {id:'v',name:'Ten-minute video.mp4',url:'/media/v.mp4',duration:600,kind:'video'}, brief: '', targetSeconds:90,status:'idle',words};
test('caption-only keeps the entire ten-minute source in every aspect ratio, ignoring legacy targets', async () => {
 for(const format of ['vertical','landscape','portrait'] as const) {
  const result=await generateEdit({...project,format},'unused',{client:client(),planner:async()=>{throw Error('Caption-only must not call a cut planner');}});
  assert.equal(durationFrames(result.plan)/FPS,600);
  assert.deepEqual(result.plan.segments,[{start:0,end:600,label:''}]);
  assert.equal(result.captionReview,'automatic');
 }
});
test('light trim rejects a 90-second highlight reel from a ten-minute source', async () => {
 const result=await generateEdit({...project,editMode:'polish'},'unused',{client:client(),planner:async (instructions,input)=>{
  assert.match(instructions,/NO target duration/); assert.equal('targetSeconds' in (input as object),false);
  return {title:'Complete explanation',hook:'',segments:[{start:0,end:90,label:''}]};
 }});
 assert.equal(durationFrames(result.plan)/FPS,600); assert.match(result.editNotice!,/full video was retained/);
});

test('transcription preserves mixed source languages and checkpoints before later work', async () => {
 const mock=client() as any;
 mock.audio={transcriptions:{create:async (request:any)=>{
   assert.equal(request.model,'whisper-1'); assert.equal(request.language,undefined);
   assert.match(request.prompt,/English and Mandarin/); request.file.destroy(); return {words: [...words, {word: '中文', start: 2.1, end: 2.1}]};
 }}};
 let checkpoint:Word[]=[];
 const result=await generateEdit({...project,words:[]},import.meta.filename,{client:mock,onTranscript:async w=>{checkpoint=w;}});
 assert.deepEqual(checkpoint.slice(0,words.length),words);
 assert.equal(checkpoint.at(-1)!.word,'中文'); assert.ok(checkpoint.at(-1)!.end>checkpoint.at(-1)!.start);
 assert.equal(durationFrames(result.plan)/FPS,600);
});
