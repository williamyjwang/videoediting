import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {rm, rename} from 'node:fs/promises';
import {z} from 'zod';
import {MAX_SOURCE_SECONDS, planSchema, projectEditSchema, validateCaptions, validatePlan, type Project} from '../src/shared';
import {aiConfigured, generateEdit} from './ai';
import {createSample, probe} from './media';
import {dataDir, exportDir, initializeStorage, listProjects, mediaDir, readProject, saveProject} from './store';
import {installAuthentication} from './auth';
import {JobQueue, projectWithJob} from './queue';
import {startWorker} from './worker';

await initializeStorage();
const app = express();
const port = Number(process.env.PORT || 3001);
const maxAiSeconds = z.coerce.number().int().min(1).max(MAX_SOURCE_SECONDS).parse(process.env.MCC_AI_MAX_SOURCE_SECONDS || 60);
const queue = new JobQueue(path.join(dataDir, 'jobs.sqlite'));
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({limit: '1mb'}));
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {res.status(403).json({error: 'Cross-origin writes are not allowed.'}); return;}
  }
  next();
});
app.get('/api/health', (_req, res) => res.json({ok: true, aiConfigured: aiConfigured(), maxAiSourceSeconds: maxAiSeconds, brandStatus: 'proposed'}));
const {requireAuth} = await installAuthentication(app);
app.use(['/api', '/media', '/exports'], requireAuth);
app.use('/media', express.static(mediaDir));
app.use('/exports', express.static(exportDir, {setHeaders: res => res.setHeader('Content-Disposition', 'attachment')}));
app.get('/api/projects', async (_req, res) => res.json((await listProjects()).map(project => {
  const current = projectWithJob(project, queue);
  return {id: current.id, createdAt: current.createdAt, title: current.plan?.title || current.video.name, status: current.status, exportUrl: current.exportUrl, error: current.error};
})));

app.post('/api/demo', async (_req, res) => {
  const id = randomUUID();
  const fileName = `${id}.mp4`;
  await createSample(path.join(mediaDir, fileName));
  const project: Project = {id, createdAt: new Date().toISOString(), video: {id, name: 'Synthetic studio sample.mp4', url: `/media/${fileName}`, duration: 6, kind: 'video'},
    brief: '', targetSeconds: 45, status: 'idle',
    plan: {title: 'MCC studio sample', hook: 'A preview of your next edit.', segments: [{start: 0, end: 3, label: 'SYNTHETIC DEMO'}, {start: 4, end: 6, label: 'UPLOAD YOUR OWN FOOTAGE'}]},
    words: ['Sample', 'captions.', 'Your', 'story', 'goes', 'here.'].map((word, i) => ({word, start: i * 0.8, end: i * 0.8 + 0.7})),
    captions: [{id: 'sample-1', start: 0, end: 1.55, en: 'Sample captions.', zh: '示例字幕。'}, {id: 'sample-2', start: 1.55, end: 4.8, en: 'Your story goes here.', zh: '在这里讲述你的故事。'}], format: 'vertical', fit: 'contain',
  };
  await saveProject(project); res.status(201).json(project);
});

const upload = multer({dest: path.join(dataDir, 'tmp'), limits: {fileSize: 2 * 1024 ** 3, files: 1}});
app.post('/api/projects', upload.single('video'), async (req, res) => {
  if (!req.file) {res.status(400).json({error: 'Choose a video file.'}); return;}
  try {
    const info = await probe(req.file.path);
    if (!info.video) throw new Error('Upload a video containing a readable video track.');
    if (info.duration > MAX_SOURCE_SECONDS) throw new Error('For this first version, upload footage up to 20 minutes long.');
    const id = randomUUID();
    const extension = path.extname(req.file.originalname).toLowerCase();
    if (!['.mp4', '.mov', '.webm', '.mkv', '.m4v'].includes(extension)) throw new Error('Use MP4, MOV, WebM, MKV, or M4V footage.');
    const fileName = `${id}${extension}`;
    await rename(req.file.path, path.join(mediaDir, fileName));
    const project: Project = {id, createdAt: new Date().toISOString(), video: {id, name: req.file.originalname, url: `/media/${fileName}`, duration: info.duration, kind: 'video'}, brief: '', targetSeconds: 45, words: [], status: 'idle'};
    await saveProject(project);
    res.status(201).json(project);
  } catch (error) {await rm(req.file.path, {force: true}); res.status(400).json({error: message(error)});}
});

app.get('/api/projects/:id', async (req, res) => {
  const project = await readProject(req.params.id);
  res.json(projectWithJob(project, queue));
});

app.put('/api/projects/:id/plan', async (req, res) => {
  const project = await readProject(req.params.id);
  if (queue.active(project.id)) {res.status(409).json({error: 'Wait for the current job to finish.'}); return;}
  project.plan = validatePlan(req.body, project.video.duration, project.format);
  project.error = undefined; project.exportUrl = undefined;
  await saveProject(project); res.json(project);
});

app.put('/api/projects/:id/edit', async (req, res) => {
  const project = await readProject(req.params.id);
  if (queue.active(project.id)) {res.status(409).json({error: 'Wait for the current job to finish.'}); return;}
  const edit = projectEditSchema.extend({plan: planSchema}).parse(req.body);
  validateCaptions(edit.captions, project.video.duration);
  validatePlan(edit.plan, project.video.duration, edit.format);
  Object.assign(project, edit, {error: undefined, exportUrl: undefined});
  await saveProject(project); res.json(project);
});

app.post('/api/projects/:id/music', upload.single('music'), async (req, res) => {
  if (!req.file) {res.status(400).json({error: 'Choose an audio file.'}); return;}
  try {
    const project = await readProject(String(req.params.id));
    if (queue.active(project.id)) throw new Error('Wait for the current job to finish.');
    const info = await probe(req.file.path);
    if (!info.audio || info.video) throw new Error('Upload an audio-only music file.');
    const extension = path.extname(req.file.originalname).toLowerCase();
    if (!['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(extension)) throw new Error('Use MP3, WAV, M4A, OGG, or AAC audio.');
    const id = randomUUID();
    const name = `${id}${extension}`;
    await rename(req.file.path, path.join(mediaDir, name));
    project.music = {id, name: req.file.originalname, url: `/media/${name}`, duration: info.duration, kind: 'music'};
    project.exportUrl = undefined;
    await saveProject(project); res.json(project);
  } catch (error) {await rm(req.file.path, {force: true}); res.status(400).json({error: message(error)});}
});

const analyzeBody = z.object({brief: z.string().max(3000), targetSeconds: z.number().min(5).max(180)});
app.post('/api/projects/:id/analyze', async (req, res) => {
  if (!aiConfigured()) {res.status(409).json({error: 'Set MCC_OPENAI_API_KEY in the server environment, then restart the API. Manual editing and rendering are available without a key.'}); return;}
  const project = await readProject(req.params.id);
  if (queue.active(project.id)) {res.status(409).json({error: 'A job is already running.'}); return;}
  if (project.video.duration > maxAiSeconds) {res.status(400).json({error: `AI testing is limited to ${maxAiSeconds} seconds of source footage. Manual editing is still available.`}); return;}
  Object.assign(project, analyzeBody.parse(req.body));
  project.status = 'analyzing'; project.error = undefined; project.exportUrl = undefined;
  queue.enqueue('analyze', project);
  res.status(202).json(project);
});

app.post('/api/projects/:id/render', async (req, res) => {
  const project = await readProject(req.params.id);
  if (!project.plan) {res.status(400).json({error: 'Save an edit plan first.'}); return;}
  if (queue.active(project.id)) {res.status(409).json({error: 'An edit or render is already queued for this project.'}); return;}
  validatePlan(project.plan, project.video.duration, project.format);
  project.status = 'rendering'; project.error = undefined;
  queue.enqueue('render', project);
  res.status(202).json(project);
});

function message(error: unknown) {return error instanceof Error ? error.message : 'The operation failed.';}
if (existsSync(path.resolve('dist/index.html'))) {
  app.use(express.static('dist'));
  app.get('/', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
}
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error instanceof z.ZodError ? 400 : error instanceof multer.MulterError ? 400 : (error as {status?: number}).status || 400;
  res.status(status).json({error: message(error)});
});
app.listen(port, process.env.MCC_HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'), () => {
  startWorker(queue);
  console.log(`MCC Studio API listening on port ${port}`);
});

