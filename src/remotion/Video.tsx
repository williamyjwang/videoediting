import {AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {brand} from '../brand';
import '../fonts';
import {Logo} from '../Logo';
import {FPS, framesForSegment, type Caption, type VideoProps, type Word} from '../shared';

function BilingualCaptions({captions, sourceStart, wide}: {captions: Caption[]; sourceStart: number; wide: boolean}) {
  const time = sourceStart + useCurrentFrame() / FPS;
  const cue = captions.find(c => time >= c.start && time < c.end);
  if (!cue) return null;
  return <div style={{position: 'absolute', bottom: wide ? 100 : 245, left: '7%', right: '7%', textAlign: 'center'}}><div style={{display: 'inline-block', maxWidth: '100%', padding: '16px 24px', borderRadius: 8, background: 'rgba(13,13,13,.87)', lineHeight: 1.35, overflowWrap: 'anywhere', whiteSpace: 'pre-line'}}>
    {cue.en && <div style={{fontSize: wide ? 40 : 46, fontWeight: 500}}>{cue.en}</div>}
    {cue.zh && <div style={{fontSize: wide ? 40 : 46, fontWeight: 500, color: brand.paper, marginTop: cue.en ? 8 : 0}}>{cue.zh}</div>}
  </div></div>;
}

function Captions({words, sourceStart}: {words: Word[]; sourceStart: number}) {
  const frame = useCurrentFrame();
  const time = sourceStart + frame / FPS;
  const current = words.findIndex(w => time >= w.start && time < w.end + 0.09);
  if (current < 0) return null;
  const group = words.slice(Math.floor(current / 5) * 5, Math.floor(current / 5) * 5 + 5);
  return <div style={{position: 'absolute', bottom: 260, left: 72, right: 72, textAlign: 'center'}}>
    <span style={{background: 'rgba(13,13,13,.87)', padding: '16px 24px', borderRadius: 8, display: 'inline-block', fontSize: 54, fontWeight: 600, lineHeight: 1.25}}>
      {group.map((w, i) => <span key={i} style={{color: time >= w.start && time < w.end + 0.09 ? brand.accent : 'white'}}>{w.word.trim()} </span>)}
    </span>
  </div>;
}

export function MCCVideo({videoSrc, musicSrc, plan, words, captions, format, fit = 'contain'}: VideoProps) {
  const frame = useCurrentFrame();
  const wide = format === 'landscape';
  let offset = 0;
  return <AbsoluteFill style={{background: brand.ink, fontFamily: brand.font, color: brand.paper}}>
    {plan.segments.map((clip, i) => {
      const duration = framesForSegment(clip);
      const from = offset;
      offset += duration;
      return <Sequence key={`${i}-${clip.start}`} from={from} durationInFrames={duration}>
        <AbsoluteFill>
          <OffthreadVideo src={videoSrc} trimBefore={Math.round(clip.start * FPS)} trimAfter={Math.round(clip.start * FPS) + duration} style={{height: '100%', width: '100%', objectFit: fit}} volume={1}/>
          <AbsoluteFill style={{background: 'linear-gradient(180deg,rgba(0,0,0,.25),transparent 45%,rgba(0,0,0,.45))'}}/>
          {captions ? <BilingualCaptions sourceStart={Math.round(clip.start * FPS) / FPS} captions={captions} wide={wide}/> : <Captions sourceStart={Math.round(clip.start * FPS) / FPS} words={words.filter(w => w.end > clip.start && w.start < clip.end)}/>}
          {clip.label && <div style={{position: 'absolute', left: 64, bottom: wide ? 40 : 120, fontSize: 26, letterSpacing: 3, textTransform: 'uppercase', maxWidth: wide ? 1700 : 900}}>{clip.label}</div>}
        </AbsoluteFill>
      </Sequence>;
    })}
    {musicSrc && <Audio src={musicSrc} loop volume={0.10}/>}
    <div style={{position: 'absolute', top: 64, left: 54}}><Logo width={220} inVideo/></div>
    {plan.hook && frame < 100 && <div style={{position: 'absolute', top: wide ? 150 : 240, left: 64, right: 64, opacity: interpolate(frame, [0, 8, 85, 100], [0, 1, 1, 0], {extrapolateRight: 'clamp'}), fontSize: wide ? 62 : 76, fontWeight: 700, lineHeight: 1.05, textShadow: '0 3px 24px #000'}}>{plan.hook}</div>}
  </AbsoluteFill>;
}
