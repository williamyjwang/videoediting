import {z} from 'zod';

export const FPS = 30;
export const MAX_SOURCE_SECONDS = 20 * 60;
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
};
export type VideoProps = {videoSrc: string; musicSrc?: string; plan: EditPlan; words: Word[]};
export const framesForSegment = (segment: {start: number; end: number}) =>
  Math.max(1, Math.round(segment.end * FPS) - Math.round(segment.start * FPS));
export const durationFrames = (plan: EditPlan) => plan.segments.reduce((sum, segment) => sum + framesForSegment(segment), 0);

export function validatePlan(input: unknown, sourceDuration: number): EditPlan {
  const plan = planSchema.parse(input);
  for (const segment of plan.segments) {
    if (segment.end <= segment.start || segment.end - segment.start < 0.2) throw new Error('Each cut must be at least 0.2 seconds long.');
    if (segment.end > sourceDuration + 0.02) throw new Error('A cut extends beyond the source footage.');
  }
  if (durationFrames(plan) > 180 * FPS) throw new Error('Keep the finished edit under 3 minutes.');
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
