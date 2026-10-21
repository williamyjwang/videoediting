import {FPS, framesForSegment, type EditPlan, type Caption} from './shared';

export function captionsForExport(captions: Caption[], plan: EditPlan): Caption[] {
  let offset = 0;
  return plan.segments.flatMap((clip, index) => {
    const from = Math.round(clip.start * FPS) / FPS;
    const duration = framesForSegment(clip) / FPS;
    const cues = captions.filter(c => c.end > from && c.start < from + duration).map(c => ({...c, id: `${index}-${c.id}`, start: offset + Math.max(0, c.start - from), end: offset + Math.min(duration, c.end - from)}));
    offset += duration;
    return cues;
  });
}

const stamp = (seconds: number) => {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
export function toSrt(captions: Caption[], language: 'en' | 'zh' | 'both' = 'both') {
  return captions.filter(c => (language === 'both' ? c.en.trim() || c.zh.trim() : c[language].trim())).map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${(language === 'both' ? [c.en, c.zh] : [c[language]]).filter(Boolean).join('\n')}`).join('\n\n') + '\n';
}
export function parseSrt(text: string): Caption[] {
  const seconds = (value: string) => {const [h, m, s] = value.replace(',', '.').split(':').map(Number); return h * 3600 + m * 60 + s;};
  return text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/).filter(Boolean).map((block, i) => {
    const lines = block.split('\n');
    if (/^\d+$/.test(lines[0])) lines.shift();
    const match = lines.shift()?.match(/^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})$/);
    if (!match || !lines.length || match.slice(1).some(t => Number(t.slice(3, 5)) > 59 || Number(t.slice(6, 8)) > 59)) throw new Error(`Invalid SRT cue ${i + 1}. Use source-video timestamps.`);
    const zh = lines.filter(line => /[\u3400-\u9fff]/.test(line)).join('\n');
    const en = lines.filter(line => !/[\u3400-\u9fff]/.test(line)).join('\n');
    return {id: `import-${i}`, start: seconds(match[1]), end: seconds(match[2]), en, zh};
  });
}

export function improveCaptionReadability(captions: Caption[], duration: number): Caption[] {
  const cues = captions.map(c => ({...c}));
  const needed = (c: Caption) => Math.max(c.en.length / 24, c.zh.length / 15);
  const fast = (c: Caption) => needed(c) > c.end - c.start;
  // Hold short cues a little longer when there is room, without overlapping.
  cues.forEach((c, i) => {if (fast(c)) c.end = Math.min(Math.max(c.end, c.start + needed(c)), c.end + .4, cues[i + 1]?.start ?? duration);});
  for (let i = 0; i < cues.length - 1; i++) {
    const a = cues[i], b = cues[i + 1];
    const merged = {...a, end: b.end, en: `${a.en} ${b.en}`, zh: `${a.zh}${b.zh}`};
    // Keep every word and its covered interval; do not merge across long pauses
    // or turn a readability warning into an oversized two-language block.
    if ((fast(a) || fast(b)) && b.start - a.end <= .4 && merged.end - merged.start <= 6 && merged.en.length <= 120 && merged.zh.length <= 64 && !fast(merged)) {
      cues.splice(i, 2, merged); i = Math.max(-1, i - 2);
    }
  }
  return cues;
}

// These checks flag likely omissions/readability issues; they cannot judge translation meaning.
export function captionQuality(captions: Caption[], words: import('./shared').Word[]) {
  const issues: string[] = [];
  const stretched = words.filter(w => w.end - w.start > 2.5 && /^[\p{L}'’-]+$/u.test(w.word) && w.word.length < 30);
  for (const word of stretched) issues.push(`Transcript timing near ${word.start.toFixed(2)}s: one word spans ${(word.end-word.start).toFixed(1)} seconds. Check for missing speech against the audio.`);
  const missing = words.filter(word => {
    const middle = (word.start + word.end) / 2;
    return !captions.some(c => c.start <= middle && c.end > middle && (c.en.trim() || c.zh.trim()));
  });
  if (missing.length) issues.push(`${missing.length} transcript word${missing.length === 1 ? '' : 's'} may lack subtitles (first at ${missing[0].start.toFixed(2)}s). Check against the audio.`);
  captions.forEach((cue, i) => {
    if (!cue.en.trim() || !cue.zh.trim()) issues.push(`Caption ${i + 1}: one language is empty.`);
    const duration = cue.end - cue.start;
    if (duration > 0 && (cue.en.length / duration > 24 || cue.zh.length / duration > 15)) issues.push(`Caption ${i + 1}: text may be too fast to read.`);
    if (cue.en.length > 120 || cue.zh.length > 64) issues.push(`Caption ${i + 1}: consider splitting this long subtitle.`);
  });
  return issues;
}
