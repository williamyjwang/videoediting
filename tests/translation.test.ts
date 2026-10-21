import assert from 'node:assert/strict';
import {test} from 'node:test';
import type OpenAI from 'openai';
import {bilingualCaptions, captionGroups, generateEdit, transcriptAgreement} from '../server/ai';
import {durationFrames, FPS, type Project, type Word} from '../src/shared';

const words: Word[] = [{word: 'This', start: 0, end: .3}, {word: 'means', start: .4, end: .7}, {word: 'confidence.', start: .8, end: 1.2}, {word: '它', start: 1.3, end: 1.5}, {word: '会增强。', start: 1.6, end: 2}];
function client(reply?: unknown, inspect?: (request: any) => void) {
 return {responses: {create: async (request: any) => {
  inspect?.(request);
  const input = JSON.parse(request.input);
  const payload = reply || {captions: Object.fromEntries(input.cues.map((c: any) => [c.id, {en: 'Faithful English.', zh: '自然的中文字幕。'}]))};
  if(payload && typeof payload==='object' && 'captions' in payload && !Array.isArray((payload as any).captions)) for(const cue of input.cues) if((payload as any).captions[cue.id]) (payload as any).captions[cue.id].sourceText=cue.text;
  return {output_text:JSON.stringify(payload)};
 }}} as unknown as OpenAI;
}
test('mixed-language subtitles see full context, receive a review pass, and retain source timing', async () => {
 const requests: any[] = [];
 const captions = await bilingualCaptions(client(undefined, r => requests.push(r)), words, 2);
 assert.equal(requests.length, 2);
 const initial = JSON.parse(requests[0].input), review = JSON.parse(requests[1].input);
 assert.deepEqual(initial.sourceTranscript, [{text: 'This means confidence.'}, {text: '它会增强。'}]);
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
 assert.equal(captions.length, 85); assert.equal(requests.length, 16);
 assert.ok(requests.every(r=>r.cues.length <= 12 && r.sourceTranscript.length === 85));
 assert.equal(requests[4].previousCaptions.length, 20);
 assert.deepEqual(captions.map(c=>c.id), longWords.map((_,i)=>String(i)));
});
test('completes a missing language without overwriting user-corrected text', async () => {
 const existing = [{id: 'manual', start: 0, end: 2, en: 'My corrected wording.', zh: ''}];
 const captions = await bilingualCaptions(client(), words, 2, existing);
 assert.equal(captions[0].en, existing[0].en); assert.ok(captions[0].zh);
 assert.deepEqual([captions[0].start,captions[0].end],[0,2]);
});
test('a blank model response receives one repair before review, without losing cues', async () => {
 let calls=0;
 const mock=client() as any;
 mock.responses.create=async (request:any)=>{
  calls++;
  const input=JSON.parse(request.input);
  if(calls===1) return {output_text:JSON.stringify({captions:{'0':{en:'',zh:''},'1':{en:'',zh:''}}})};
  if(calls===2) assert.match(request.instructions,/previous response failed validation/);
  return {output_text:JSON.stringify({captions:Object.fromEntries(input.cues.map((c:any)=>[c.id,{sourceText:c.text,en:'Complete speech.',zh:'完整的话语。'}]))})};
 };
 const result=await bilingualCaptions(mock,words,2);
 assert.equal(calls,3); assert.equal(result.length,2);
 assert.ok(result.every(c=>c.en && c.zh));
});
test('Chinese caption groups stay short and do not overlap at timestamp boundaries', () => {
 const input = Array.from({length: 60}, (_,i)=>({word: '中',start:i*.1,end:i*.1+.12}));
 const groups=captionGroups(input);
 assert.ok(groups.every(c=>c.en.length<=10));
 for(let i=1;i<groups.length;i++) assert.ok(groups[i].start>=groups[i-1].end);
});
const project: Project = {id: 'test', createdAt: '', video: {id:'v',name:'Ten-minute video.mp4',url:'/media/v.mp4',duration:600,kind:'video'}, brief: '', targetSeconds:90,status:'idle',words,transcriptVersion:2,referenceTranscript:words.map(w=>w.word).join(' ')};
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
   request.file.destroy();
   if(request.model==='gpt-transcribe') {assert.deepEqual(request.languages,['en','zh']);return {text:words.map(w=>w.word).join(' ')+' 中文',languages:[{code:'en'},{code:'zh'}]};}
   assert.equal(request.model,'whisper-1'); assert.equal(request.language,undefined); assert.equal(request.prompt,undefined);
   return {words: [...words, {word: '中文', start: 2.1, end: 2.1}]};
 }}};
 let checkpoint:Word[]=[];
 const result=await generateEdit({...project,words:[]},import.meta.filename,{client:mock,onTranscript:async w=>{checkpoint=w;}});
 assert.deepEqual(checkpoint.slice(0,words.length),words);
 assert.equal(checkpoint.at(-1)!.word,'中文'); assert.ok(checkpoint.at(-1)!.end>checkpoint.at(-1)!.start);
 assert.equal(durationFrames(result.plan)/FPS,600);
});

test('provider failures expose actionable categories without credentials', async () => {
 const {default: OpenAI}=await import('openai');
 const {publicAiError}=await import('../server/ai');
 const secret='sk-do-not-log';
 const authentication=new OpenAI.APIError(401,{message:'Incorrect API key: '+secret},'Incorrect API key: '+secret,new Headers());
 assert.match(publicAiError(authentication),/rejected the API key/);
 assert.equal(publicAiError(authentication).includes(secret),false);
 const quota=new OpenAI.APIError(429,{code:'insufficient_quota',message:secret},secret,new Headers());
 assert.match(publicAiError(quota),/quota is unavailable/);
 assert.equal(publicAiError(new Error(secret)).includes(secret),false);
});

test('named translation fields cannot omit cues and are reconstructed in source order', async () => {
 const captions = await bilingualCaptions(client({captions: {'1': {en: 'It grows.', zh: '会增强。'}, '0': {en: 'Confidence.', zh: '自信。'}}}), words, 2);
 assert.deepEqual(captions.map(c=>c.id),['0','1']);
 assert.equal(captions[0].zh,'自信。');
 await assert.rejects(bilingualCaptions(client({captions: {'0': {en: 'Confidence.', zh: '自信。'}}}),words,2));
 await assert.rejects(bilingualCaptions(client({captions: {'0': {en: 'A', zh: '甲'}, '1': {en: 'B', zh: '乙'}, 'context': {en: 'C', zh: '丙'}}}),words,2));
 await assert.rejects(bilingualCaptions(client({captions: {'0': {en: 'Watch 美剧', zh: '看美剧'}, '1': {en: 'B', zh: '乙'}}}),words,2));
});

test('audio language check rejects a translated transcript masquerading as original speech',()=>{
 assert.ok(transcriptAgreement(words,words.map(w=>w.word).join(' '))>.99);
 assert.ok(transcriptAgreement([{word:'这是错误的翻译',start:0,end:2}],'This is the original English speech.')<.1);
});

test('invalidated automatic captions are rebuilt instead of preserving the earlier bad draft',async()=>{
 const result=await generateEdit({...project,captionReview:'automatic',captions:[{id:'old',start:0,end:2,en:'Bad prior draft',zh:'旧的错误草稿'}]},'unused',{client:client()});
 assert.equal(result.captionTranscriptVersion,2);
 assert.notEqual(result.captions[0].en,'Bad prior draft');
});
test('cross-language ASR disagreement stops before translation or checkpointing',async()=>{
 const mock=client() as any;let checkpointed=false;
 mock.audio={transcriptions:{create:async(request:any)=>{request.file.destroy();return request.model==='gpt-transcribe'?{text:'Original English speech about learning.',languages:[{code:'en'}]}:{words:[{word:'错误的中文翻译',start:0,end:2}]};}}};
 await assert.rejects(generateEdit({...project,words:[]},import.meta.filename,{client:mock,onTranscript:async()=>{checkpointed=true;}}),/disagrees with the original-language/);
 assert.equal(checkpointed,false);
});
