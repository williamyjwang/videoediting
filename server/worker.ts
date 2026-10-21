import path from 'node:path';
import {rm} from 'node:fs/promises';
import {type Project} from '../src/shared';
import {generateEdit, publicAiError} from './ai';
import {extractAudio} from './media';
import {dataDir, mediaDir, readProject, saveProject} from './store';
import {renderProject} from './render';
import {type JobQueue} from './queue';

export function startWorker(queue: JobQueue) {
  queue.recover();
  let working = false;
  const tick = async () => {
    if (working) return;
    const job = queue.claim();
    if (!job) return;
    working = true;
    const project: Project = JSON.parse(job.payload);
    let error: string | undefined;
    try {
      project.error = undefined;
      if (job.kind === 'render') project.exportUrl = await renderProject(project);
      else {
        // Preserve successful transcription across a later translation/planner failure.
        const saved = await readProject(project.id);
        if (!project.words.length && saved.video.id === project.video.id) project.words = saved.words;
        const audio = path.join(dataDir, 'tmp', `${job.id}.mp3`);
        try {
          await extractAudio(path.join(mediaDir, path.basename(project.video.url)), audio);
          Object.assign(project, await generateEdit(project, audio, {onTranscript: async words => {project.words = words; await saveProject(project);}}));
          project.exportUrl = undefined;
        } finally {await rm(audio, {force: true});}
      }
    } catch (cause) {error = job.kind === 'analyze' ? publicAiError(cause) : cause instanceof Error ? cause.message : 'The background operation failed.';}
    try {
      project.status = 'idle'; project.error = error;
      await saveProject(project);
      queue.complete(job.id, error);
    } catch (cause) {
      // A storage failure must not silently drop the job or allow later edits
      // to overwrite its snapshot. Stop; the host restarts and recovery retries.
      console.error('Background job could not be persisted:', cause instanceof Error ? cause.message : 'Storage failure');
      process.exit(1);
    } finally {working = false;}
  };
  const timer = setInterval(() => {void tick().catch(error => {console.error('Queue failure:', error.message); process.exit(1);});}, 500);
  return () => clearInterval(timer);
}
