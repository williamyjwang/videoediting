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

// These checks flag likely omissions/readability issues; they cannot judge translation meaning.
export function captionQuality(captions: Caption[], words: import('./shared').Word[]) {
  const issues: string[] = [];
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
