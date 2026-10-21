import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {existsSync} from 'node:fs';
import path from 'node:path';
import express from 'express';
import {createServer} from 'node:http';
import {type Project, type VideoProps} from '../src/shared';
import {exportDir, mediaDir} from './store';
let bundled: Promise<string> | undefined;

export async function renderProject(project: Project) {
  if (!project.plan) throw new Error('Save an edit plan before rendering.');
  // Private source files are served only on loopback while a render runs.
  // Chromium/FFmpeg need no user session or secret embedded in their URLs.
  const mediaApp = express();
  mediaApp.use('/media', express.static(mediaDir));
  const server = createServer(mediaApp);
  await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start the private rendering media server.');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const props: VideoProps = {videoSrc: origin + project.video.url, musicSrc: project.music ? origin + project.music.url : undefined, plan: project.plan, words: project.words, captions: project.captions, format: project.format, fit: project.fit};
  // Rebundle once per process. Restart the API after changing templates.
  // The in-process promise already caches the bundle; avoid a second disk cache.
  bundled ??= bundle({entryPoint: path.resolve('src/remotion/Root.tsx'), enableCaching: false}).catch(error => {bundled = undefined; throw error;});
  const serveUrl = await bundled;
  const composition = await selectComposition({serveUrl, id: 'MCCVideo', inputProps: props, browserExecutable});
  const name = `${project.id}-${Date.now()}.mp4`;
  await renderMedia({composition, serveUrl, codec: 'h264', outputLocation: path.join(exportDir, name), inputProps: props,
    browserExecutable, concurrency: Number(process.env.MCC_RENDER_CONCURRENCY || 1), chromiumOptions: {gl: 'swangle'},
    offthreadVideoCacheSizeInBytes: 128 * 1024 * 1024, mediaCacheSizeInBytes: 128 * 1024 * 1024,
  });
  return `/exports/${name}`;
  } finally {await new Promise<void>(resolve => server.close(() => resolve()));}
}

