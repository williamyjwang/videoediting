import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
export async function probe(path: string) {
  const {stdout} = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path], {timeout: 30_000});
  const result = JSON.parse(stdout);
  const duration = Number(result.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('This file has no readable media duration.');
  return {duration, video: result.streams.some((s: {codec_type: string}) => s.codec_type === 'video'), audio: result.streams.some((s: {codec_type: string}) => s.codec_type === 'audio')};
}
export async function extractAudio(source: string, destination: string) {
  await exec('ffmpeg', ['-y', '-v', 'error', '-i', source, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', destination], {timeout: 180_000});
}
export async function createSample(destination: string) {
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x302820:s=540x960:r=30:d=6', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', '-vf', 'drawgrid=w=90:h=90:t=1:c=0xC7A36B@0.16', '-af', 'volume=0.08', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', destination], {timeout: 30_000});
}
