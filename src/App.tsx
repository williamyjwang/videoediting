import {useEffect, useRef, useState, type ChangeEvent} from 'react';
import {Player} from '@remotion/player';
import {MCCVideo} from './remotion/Video';
import {Logo} from './Logo';
import {durationFrames, FPS, outputSize, validateCaptions, type Caption, type EditPlan, type Project} from './shared';
import {captionQuality, captionsForExport, parseSrt, toSrt} from './captions';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong.');
  return result;
}
const json = (data: unknown): RequestInit => ({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
const seconds = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;

type ProjectSummary = {id: string; createdAt: string; title: string; status: Project['status']; exportUrl?: string; error?: string};
export function App({onSignOut}: {onSignOut: () => void}) {
  const [project, setProject] = useState<Project>();
  const [plan, setPlan] = useState<EditPlan>();
  const [brief, setBrief] = useState('Create a useful, confident coaching clip. Open with a clear insight, remove long pauses, and keep the speaker’s meaning intact.');
  const [target, setTarget] = useState(45);
  const [ai, setAi] = useState(false);
  const [maxAiSourceSeconds, setMaxAiSourceSeconds] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'cuts' | 'transcript' | 'captions'>('cuts');
  const input = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const [library, setLibrary] = useState<ProjectSummary[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const history = useRef<{undo: string[]; redo: string[]}>({undo: [], redo: []});
  const [historyVersion, setHistoryVersion] = useState(0);
  const running = Boolean(project && project.status !== 'idle');

  function accept(next: Project) {history.current = {undo: [], redo: []}; setHistoryVersion(v => v + 1); setProject(next); setPlan(next.plan); setDirty(false); localStorage.setItem('mcc-project', next.id);}
  useEffect(() => {
    request<{aiConfigured: boolean; maxAiSourceSeconds: number}>('/api/health').then(s => {setAi(s.aiConfigured); setMaxAiSourceSeconds(s.maxAiSourceSeconds);}).catch(e => setError(e.message));
    const saved = localStorage.getItem('mcc-project');
    if (saved) request<Project>(`/api/projects/${saved}`).then(p => {accept(p); if (p.brief) setBrief(p.brief); setTarget(p.targetSeconds);}).catch(() => localStorage.removeItem('mcc-project'));
  }, []);
  useEffect(() => {
    if (!project || project.status === 'idle') return;
    const timer = setInterval(() => {request<Project>(`/api/projects/${project.id}`).then(next => {
      if (next.status === 'idle') accept(next); else setProject(next);
    }).catch(e => setError(e.message));}, 1500);
    return () => clearInterval(timer);
  }, [project?.id, project?.status]);

  async function action(run: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try {await run();} catch (e) {setError(e instanceof Error ? e.message : 'Something went wrong.');} finally {setBusy(false);}
  }
  async function upload(file?: File, kind = 'video') {
    if (!file) return;
    await action(async () => {
      if (dirty && plan) await savePlan();
      const data = new FormData(); data.append(kind, file);
      accept(await request<Project>(kind === 'video' ? '/api/projects' : `/api/projects/${project!.id}/music`, {method: 'POST', body: data}));
    });
  }
  async function savePlan() {
    const next = await request<Project>(`/api/projects/${project!.id}/edit`, {...json({plan, captions: project!.captions || [], format: project!.format || 'vertical', fit: project!.fit || 'contain', feedback: project!.feedback || ''}), method: 'PUT'});
    accept(next); return next;
  }
  async function openLibrary() {
    await action(async () => {setLibrary(await request<ProjectSummary[]>('/api/projects')); setShowLibrary(true);});
  }
  function remember() {
    if (!project || !plan) return;
    history.current.undo = [...history.current.undo.slice(-49), JSON.stringify({project, plan})]; history.current.redo = []; setHistoryVersion(v => v + 1);
  }
  function changePlan(next: EditPlan) {remember(); setPlan(next); setDirty(true);}
  function changeProject(patch: Partial<Project>) {remember(); setProject(p => p && ({...p, ...patch})); setDirty(true);}
  function travel(direction: 'undo' | 'redo') {
    const current = history.current[direction].pop(); if (!current) return;
    history.current[direction === 'undo' ? 'redo' : 'undo'].push(JSON.stringify({project, plan}));
    const snapshot = JSON.parse(current); setProject(snapshot.project); setPlan(snapshot.plan); setDirty(true); setHistoryVersion(v => v + 1);
  }
  function changeCaption(index: number, patch: Partial<Caption>) {changeProject({captions: (project?.captions || []).map((c, i) => i === index ? {...c, ...patch} : c)});}
  function downloadSubtitles() {
    if (!project || !plan) return;
    const url = URL.createObjectURL(new Blob([toSrt(captionsForExport(project.captions || [], plan))], {type: 'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'mcc-bilingual.srt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function changeSegment(index: number, field: 'start' | 'end' | 'label', value: string) {
    if (!plan) return;
    changePlan({...plan, segments: plan.segments.map((s, i) => i === index ? {...s, [field]: field === 'label' ? value : Number(value)} : s)});
  }
  const quality = project ? captionQuality(project.captions || [], project.words) : [];
  const size = outputSize(project?.format);
  let captionsSafe = true; try {if (project) validateCaptions(project.captions || [], project.video.duration);} catch {captionsSafe = false;}
  const previewSafe = captionsSafe && plan && plan.segments.every(s => Number.isFinite(s.start) && s.start >= 0 && s.end > s.start && s.end <= (project?.video.duration || 0) + 0.02) && durationFrames(plan) <= (project?.format === 'landscape' ? 36000 : 5400);
  const duration = plan ? durationFrames(plan) / FPS : 0;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Main Character Club Studio"><Logo width={155}/><span className="brand-sub">CONTENT STUDIO</span></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <div className="nav-item active"><span>▣</span> Video editor <span className="nav-dot"/></div>
      <div className="sidebar-note"><span className="eyebrow">THE MCC WAY</span><p>Confidence.<br/>Connection.<br/>Presence.</p><div className="thin-rule"/><small>Modern Prestige<br/>Visual system v1.0 · Proposed</small></div>
      <div className="sidebar-bottom"><span className={`status-dot ${ai ? 'ready' : ''}`}/>{ai ? 'AI key configured' : 'Manual editing available'}</div>
    </aside>

    <main>
      <header className="topbar"><span>WORKSPACE <span className="slash">/</span> VIDEO EDITOR</span><div className="cloud-actions"><button disabled={busy} onClick={() => void openLibrary()}>Saved projects</button><button disabled={busy || running} onClick={() => {setProject(undefined); setPlan(undefined); setDirty(false); setShowLibrary(false); localStorage.removeItem('mcc-project');}}>New video</button><button onClick={() => void action(async () => {await request('/api/logout', {method: 'POST'}); onSignOut();})}>Sign out</button></div></header>
      <section className="hero">
        <div><div className="eyebrow gold">MAIN CHARACTER CLUB / CONTENT</div><h1>Your perspective.<br/><span>Beautifully edited.</span></h1><p>Turn your raw footage into a clear, considered story.</p></div>
        <div className="hero-detail"><div className="hero-number">01<span> / STUDIO</span></div><p>Upload. Shape. Review.<br/>Make every moment count.</p></div>
      </section>

      <section className="workspace">
        {showLibrary && <section className="card project-library"><div className="section-heading"><h3>Your saved projects</h3><button className="text-button" onClick={() => setShowLibrary(false)}>Close</button></div><p className="helper">Edits and renders continue on the server. Return here to open your project or download a finished video.</p>{library.length ? library.map(item => <button className="project-item" key={item.id} onClick={() => void action(async () => {const next = await request<Project>(`/api/projects/${item.id}`); accept(next); if (next.brief) setBrief(next.brief); setTarget(next.targetSeconds); setShowLibrary(false);})}><strong>{item.title}</strong><span>{item.status === 'idle' ? item.error ? 'Needs attention' : item.exportUrl ? 'Ready to download' : 'Draft' : item.status === 'rendering' ? 'Rendering / queued' : 'Editing / queued'} →</span></button>) : <p>No projects yet. Upload your first video below.</p>}</section>}
        <div className="workspace-heading"><div><span className="eyebrow">THE EDITING ROOM</span><h2>{project ? 'Shape your story' : 'Start with your footage'}</h2></div><span className="format-badge">{project?.format === 'landscape' ? '16:9' : project?.format === 'portrait' ? '3:4' : '9:16'} <span>{size.width} × {size.height}</span></span></div>
        {(error || project?.error) && <div className="alert" role="alert">{error || project?.error}</div>}
        {notice && <div className="notice" role="status">{notice}</div>}
        <div className="editor-grid">
          <div className="controls-column">
            <section className="card">
              <div className="section-heading"><span className="step">01</span><h3>Source footage</h3><span className="muted tiny">UP TO 20 MIN</span></div>
              <input ref={input} type="file" accept="video/*,.mkv" hidden disabled={busy || running} onChange={e => void upload(e.target.files?.[0])}/>
              <button className={`upload-zone ${project ? 'has-file' : ''}`} disabled={busy || running} onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault(); if (!busy && !running) void upload(e.dataTransfer.files[0]);}}>
                <span className="upload-icon">↑</span><strong>{project ? project.video.name : 'Drop your footage here'}</strong><span>{project ? `${seconds(project.video.duration)} of source footage · Click to replace` : 'or click to browse · MP4, MOV, WebM'}</span>
              </button>
              {!project && <button className="text-button sample-button" disabled={busy} onClick={() => void action(async () => {accept(await request<Project>('/api/demo', {method: 'POST'})); setNotice('Synthetic sample footage with demonstration captions. No AI was used.');})}>Explore with a sample <span>↗</span></button>}
            </section>
            <section className="card">
              <div className="section-heading"><span className="step">02</span><h3>Creative direction</h3></div>
              {project && <div className="output-options"><label htmlFor="output-format">Output preset</label><select id="output-format" disabled={busy || running} value={project.format || 'vertical'} onChange={e => changeProject({format: e.target.value as Project['format']})}><option value="vertical">Vertical · Reels / Douyin / RED · 9:16</option><option value="landscape">YouTube horizontal · 16:9</option><option value="portrait">Portrait · 3:4</option></select><label htmlFor="video-fit">Video framing</label><select id="video-fit" disabled={busy || running} value={project.fit || 'contain'} onChange={e => changeProject({fit: e.target.value as Project['fit']})}><option value="contain">Show full frame (with bars)</option><option value="cover">Fill canvas (center crop)</option></select></div>}
              <label htmlFor="brief">What should this video communicate?</label>
              <textarea id="brief" value={brief} maxLength={3000} onChange={e => setBrief(e.target.value)} rows={4} disabled={busy || running}/>
              <div className="brief-options"><div><label htmlFor="duration">Target length</label><select id="duration" value={target} disabled={busy || running} onChange={e => setTarget(Number(e.target.value))}><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds</option><option value={90}>90 seconds</option></select></div><div><label>Visual direction</label><div className="style-pill"><span className="gold-square"/>Modern Prestige</div></div></div>
              <button className="primary full" disabled={!project || busy || running || !ai || project.video.duration > maxAiSourceSeconds} onClick={() => void action(async () => {if (dirty && plan) await savePlan(); accept(await request<Project>(`/api/projects/${project!.id}/analyze`, json({brief, targetSeconds: target})));})}>{project?.status === 'analyzing' ? 'Transcribing & shaping your edit…' : 'Generate AI edit'}<span>↗</span></button>
              <p className="helper">AI pilot: up to {maxAiSourceSeconds} seconds of source footage per run. Longer sources can be edited manually.</p><p className="helper">{ai ? 'Sends extracted audio to OpenAI and your transcript to the configured editor. Review cuts and captions before exporting.' : 'Automatic editing is not connected yet. Manual editing and rendering are available.'}</p>
              {project && !plan && <button className="text-button" disabled={busy || running} onClick={() => {changePlan({title: 'Untitled MCC edit', hook: '', segments: [{start: 0, end: Math.min(target, project.video.duration), label: ''}]});}}>Create a manual cut →</button>}
            </section>
            <section className="card music-card"><div className="section-heading"><span className="step">03</span><h3>Soundtrack</h3><span className="muted tiny">OPTIONAL</span></div><p className="helper">{project?.music ? project.music.name : 'Upload a licensed track. It will sit quietly beneath the speaker at 10% volume.'}</p><label className={`secondary file-button ${!project || busy || running ? 'disabled' : ''}`}>＋ Add music<input type="file" accept="audio/*" disabled={!project || busy || running} onChange={(e: ChangeEvent<HTMLInputElement>) => void upload(e.target.files?.[0], 'music')}/></label></section>
          </div>

          <div className="preview-column">
            <section className="preview-card"><div className="preview-heading"><span className="eyebrow">LIVE PREVIEW</span><span className="preview-status"><span className="status-dot ready"/>{project?.status === 'rendering' ? 'Rendering MP4' : 'Review your cut'}</span></div>
              <div className="preview-stage">{project && plan && previewSafe ? <Player key={project.id + JSON.stringify(plan) + project.music?.id} component={MCCVideo} inputProps={{videoSrc: project.video.url, musicSrc: project.music?.url, plan, words: project.words, captions: project.captions, format: project.format, fit: project.fit}} compositionWidth={size.width} compositionHeight={size.height} fps={FPS} durationInFrames={durationFrames(plan)} controls style={{height: '100%', maxWidth: '100%', aspectRatio: `${size.width} / ${size.height}`}}/> : <div className="empty-preview"><span className="frame-corner top-left"/><span className="frame-corner bottom-right"/><div className="preview-monogram">01</div><div className="empty-rule"/><p>{project ? 'Your story starts here.' : 'A space for your next story.'}</p><small>{project ? 'Generate an edit or create a manual cut.' : 'Upload your footage to begin.'}</small></div>}</div>
              <div className="preview-footer"><span>{size.width} × {size.height} <span className="muted">/</span> 30 FPS</span><span>{plan ? seconds(duration) : '—:—'}</span></div>
            </section>
            <div className="brand-notice"><span className="mini-swatch"/><div><strong>MCC visual system applied</strong><p>Official logo. Ivory captions. Gold emphasis.<br/>Approved end-card CTA pending.</p></div></div>
          </div>
        </div>

        {plan && project && <section className="card edit-card"><div className="edit-card-heading"><div><span className="eyebrow">REFINE THE DETAILS</span><h2>Your edit, your call.</h2></div><div className="tabs"><button className={tab === 'cuts' ? 'selected' : ''} onClick={() => setTab('cuts')}>Edit plan</button><button className={tab === 'captions' ? 'selected' : ''} onClick={() => setTab('captions')}>Bilingual captions</button><button className={tab === 'transcript' ? 'selected' : ''} onClick={() => setTab('transcript')}>Transcript</button></div></div>
          {tab === 'cuts' ? <fieldset disabled={busy || running}><div className="plan-fields"><div><label htmlFor="title">Project title</label><input id="title" value={plan.title} maxLength={100} onChange={e => changePlan({...plan, title: e.target.value})}/></div><div><label htmlFor="hook">Opening hook <span className="muted">· optional</span></label><input id="hook" value={plan.hook} maxLength={140} onChange={e => changePlan({...plan, hook: e.target.value})}/></div></div>
            <p className="helper">Times refer to the original footage. Drag-free, precise cuts; the preview follows your changes.</p>
            <div className="cuts">{plan.segments.map((clip, i) => <div className="cut-row" key={i}><span className="cut-number">{String(i + 1).padStart(2, '0')}</span><label>IN (SEC)<input type="number" min={0} step="0.01" value={clip.start} onChange={e => changeSegment(i, 'start', e.target.value)}/></label><span className="cut-arrow">→</span><label>OUT (SEC)<input type="number" min={0} step="0.01" value={clip.end} onChange={e => changeSegment(i, 'end', e.target.value)}/></label><label className="cut-label">ON-SCREEN LABEL<input value={clip.label} maxLength={90} placeholder="Optional supporting text" onChange={e => changeSegment(i, 'label', e.target.value)}/></label><button className="remove" aria-label={`Remove cut ${i + 1}`} disabled={plan.segments.length === 1} onClick={() => changePlan({...plan, segments: plan.segments.filter((_, index) => index !== i)})}>×</button></div>)}</div>
            <button className="text-button" disabled={plan.segments.length >= 40} onClick={() => changePlan({...plan, segments: [...plan.segments, {start: 0, end: Math.min(5, project.video.duration), label: ''}]})}>＋ Add a cut</button></fieldset> : tab === 'captions' ? <fieldset disabled={busy || running} className="caption-editor"><p className="helper">Edit English and Chinese independently. Times refer to the source footage. Your corrections are preserved when generating another AI edit. Exports follow your selected cuts.</p><details className="caption-quality"><summary>Subtitle checks · {quality.length ? `${quality.length} to review` : 'no timing or readability flags'}</summary><p className="helper">These checks compare subtitles with transcript timing and reading speed. Review translation meaning against the audio.</p>{quality.length > 0 && <ul>{quality.slice(0, 12).map((issue, i) => <li key={i}>{issue}</li>)}</ul>}{quality.length > 12 && <p>Plus {quality.length - 12} more checks.</p>}</details><div className="caption-actions"><label className="secondary file-button">Import SRT<input type="file" accept=".srt" onChange={e => {const file = e.target.files?.[0]; if (file) void action(async () => {const cues = validateCaptions(parseSrt(await file.text()), project.video.duration); changeProject({captions: cues}); setNotice('Subtitles imported using source-video timings. Save your edit to keep them.');}); e.target.value = '';}}/></label><button className="secondary" onClick={downloadSubtitles} disabled={!captionsSafe || !project.captions?.length}>Download bilingual SRT</button></div>{!captionsSafe && <p role="alert">Check caption times: they must be in order, non-overlapping, and within the source video.</p>}{(project.captions || []).map((cue, i) => <div className="caption-row" key={cue.id}><div className="caption-times"><strong>{i + 1}</strong><label>Start (seconds)<input aria-label={`Caption ${i + 1} start`} type="number" step="0.01" min="0" value={cue.start} onChange={e => changeCaption(i, {start: Number(e.target.value)})}/></label><label>End (seconds)<input aria-label={`Caption ${i + 1} end`} type="number" step="0.01" min="0" value={cue.end} onChange={e => changeCaption(i, {end: Number(e.target.value)})}/></label><button className="remove" aria-label={`Delete caption ${i + 1}`} onClick={() => changeProject({captions: project.captions!.filter((_, n) => n !== i)})}>×</button></div><div className="caption-languages"><label>English<textarea aria-label={`English caption ${i + 1}`} maxLength={500} rows={2} value={cue.en} onChange={e => changeCaption(i, {en: e.target.value})}/></label><label>中文<textarea aria-label={`Chinese caption ${i + 1}`} maxLength={500} rows={2} value={cue.zh} onChange={e => changeCaption(i, {zh: e.target.value})}/></label></div></div>)}<button className="text-button" onClick={() => {const start = project.captions?.at(-1)?.end || 0; if (start >= project.video.duration) {setError('The last caption already reaches the end of the source.'); return;} changeProject({captions: [...project.captions || [], {id: crypto.randomUUID(), start, end: Math.min(start + 2, project.video.duration), en: '', zh: ''}]});}}>＋ Add caption</button></fieldset> : <div className="transcript">{project.words.length ? project.words.map((w, i) => <span key={i} title={`${w.start.toFixed(2)}–${w.end.toFixed(2)}s`}>{w.word} </span>) : 'No transcript yet. AI analysis adds timestamped speech and automatic captions. Manual cuts work without a transcript.'}</div>}
          <div className="edit-history" data-version={historyVersion}><button className="secondary" disabled={busy || running || !history.current.undo.length} onClick={() => travel('undo')}>Undo</button><button className="secondary" disabled={busy || running || !history.current.redo.length} onClick={() => travel('redo')}>Redo</button></div><label htmlFor="feedback">Feedback for the next AI edit</label><textarea id="feedback" value={project.feedback || ''} maxLength={6000} disabled={busy || running} onChange={e => changeProject({feedback: e.target.value})} placeholder="For this project: keep the complete explanation; use fewer cuts…"/><p className="helper">Saved with this project and included in its next AI plan. This does not automatically retrain the model.</p><div className="export-bar"><p>{running ? project.status === 'rendering' ? 'Your render is queued or processing. You can close this tab and return later.' : 'Your edit is queued or processing. You can close this tab and return later.' : dirty ? 'Unsaved changes' : 'Edit plan saved'}<span>Review captions, crop, music levels, and claims before publishing.</span></p><div><button className="secondary" disabled={!dirty || busy || running} onClick={() => void action(async () => {await savePlan(); setNotice('Edit plan saved.');})}>Save edit</button><button className="primary" disabled={busy || running || !previewSafe} onClick={() => void action(async () => {if (dirty) await savePlan(); accept(await request<Project>(`/api/projects/${project.id}/render`, {method: 'POST'}));})}>{project.status === 'rendering' ? 'Rendering…' : 'Render MP4'}<span>↓</span></button></div></div>
          {project.exportUrl && !dirty && <a className="download" href={project.exportUrl} download>Download your finished MP4 <span>↗</span></a>}
        </section>}
        <footer className="page-footer"><span>MAIN CHARACTER CLUB <span className="muted">/ CONTENT STUDIO</span></span><span>Made with intention. Rendered with Remotion.</span></footer>
      </section>
    </main>
  </div>;
}

