import {z} from 'zod';

export const FPS = 30;
export const MAX_SOURCE_SECONDS = 20 * 60;
export const outputSchema = z.enum(['vertical', 'landscape', 'portrait']);
export type OutputFormat = z.infer<typeof outputSchema>;
export const outputSize = (format: OutputFormat = 'vertical') => format === 'landscape' ? {width: 1920, height: 1080} : format === 'portrait' ? {width: 1080, height: 1440} : {width: 1080, height: 1920};
export const captionSchema = z.object({id: z.string().min(1).max(80), start: z.number().nonnegative(), end: z.number().positive(), en: z.string().max(500), zh: z.string().max(500)}).strict();
export type Caption = z.infer<typeof captionSchema>;
export const projectEditSchema = z.object({captions: z.array(captionSchema).max(3000), format: outputSchema, fit: z.enum(['contain', 'cover']), feedback: z.string().max(6000)}).strict();
export function validateCaptions(input: unknown, duration: number): Caption[] {
  const captions = z.array(captionSchema).max(3000).parse(input);
  const ids = new Set<string>();
  let previousEnd = 0;
  for (const cue of captions) {
    if (cue.end <= cue.start || cue.end > duration + 0.02) throw new Error('Caption timing must stay inside the source video.');
    if (ids.has(cue.id)) throw new Error('Caption IDs must be unique.');
    if (cue.start < previousEnd - 0.001) throw new Error('Captions must be in order and must not overlap.');
    ids.add(cue.id); previousEnd = cue.end;
  }
  return captions;
}
export const segmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  label: z.string().max(90),
}).strict();
export const planSchema = z.object({
  title: z.string().min(1).max(100),
  hook: z.string().max(140),
  segments: z.array(segmentSchema).min(1).max(40),
}).strict();
export type EditPlan = z.infer<typeof planSchema>;
export type Word = {word: string; start: number; end: number};
export type Media = {id: string; name: string; url: string; duration: number; kind: 'video' | 'music'};
export type Project = {
  id: string; createdAt: string; video: Media; music?: Media;
  brief: string; targetSeconds: number; status: 'idle' | 'analyzing' | 'rendering';
  plan?: EditPlan; words: Word[]; error?: string; exportUrl?: string;
  progress?: number;
  captions?: Caption[]; format?: OutputFormat; fit?: 'contain' | 'cover'; feedback?: string;
};
export type VideoProps = {videoSrc: string; musicSrc?: string; plan: EditPlan; words: Word[]; captions?: Caption[]; format?: OutputFormat; fit?: 'contain' | 'cover'};
export const framesForSegment = (segment: {start: number; end: number}) =>
  Math.max(1, Math.round(segment.end * FPS) - Math.round(segment.start * FPS));
export const durationFrames = (plan: EditPlan) => plan.segments.reduce((sum, segment) => sum + framesForSegment(segment), 0);

export function validatePlan(input: unknown, sourceDuration: number, format: OutputFormat = 'vertical'): EditPlan {
  const plan = planSchema.parse(input);
  for (const segment of plan.segments) {
    if (segment.end <= segment.start || segment.end - segment.start < 0.2) throw new Error('Each cut must be at least 0.2 seconds long.');
    if (segment.end > sourceDuration + 0.02) throw new Error('A cut extends beyond the source footage.');
  }
  const limit = format === 'landscape' ? MAX_SOURCE_SECONDS : 180;
  if (durationFrames(plan) > limit * FPS) throw new Error(format === 'landscape' ? 'Keep the finished edit under 20 minutes.' : 'Keep the finished edit under 3 minutes.');
  return plan;
}

// Tighten selected moments using spoken-word timestamps, retaining a little room
// around speech and splitting long pauses. Never synthesize caption text.
export function tightenPlan(plan: EditPlan, words: Word[]): EditPlan {
  if (!words.length) return plan;
  const segments: EditPlan['segments'] = [];
  for (const clip of plan.segments) {
    const spoken = words.filter(w => w.start >= clip.start && w.end <= clip.end);
    if (!spoken.length) {segments.push(clip); continue;}
    let start = Math.max(clip.start, spoken[0].start - 0.12);
    let end = spoken[0].end;
    for (const word of spoken.slice(1)) {
      if (word.start - end > 0.65) {
        segments.push({start, end: Math.min(clip.end, end + 0.12), label: clip.label});
        start = Math.max(clip.start, word.start - 0.12);
      }
      end = word.end;
    }
    segments.push({start, end: Math.min(clip.end, end + 0.15), label: clip.label});
  }
  return segments.length <= 40 ? {...plan, segments} : plan;
}
