# Main Character Club · Content Studio

A private editing studio built with React, Codex, FFmpeg, and Remotion. Upload coaching footage, generate or manually write an edit plan, generate bilingual subtitles with a full-length preview, and render an MP4. The cloud version keeps working after you close the browser: sign back in and open **Saved projects** for the result.

**For cloud use, no local installation is required.** See [Cloud deployment](docs/CLOUD-DEPLOYMENT.md). The Docker image and Render blueprint are prepared; connecting the hosting service, entering secure credentials, and verifying the deployment are still needed. Local instructions below are for development.

## Start

Prerequisites: Node 24+, npm, FFmpeg/ffprobe, and Chromium. Codex CLI must be installed and authenticated when using the Codex planner.

```bash
cd /workspace/videoediting
npm ci --cache /workspace/.npm-cache
npm run dev
```

Vite uses port 5173; the API uses port 3001. Alternatively, `npm run build && npm start` serves the built studio and API together on port 3001. Restart the API after changing Remotion templates. In cloud tasks, use the existing checkout; tasks are already isolated and do not need a new Git worktree.

## Editing a video

1. Upload up to 20 minutes / 2 GB of raw footage. H.264 MP4 with AAC audio is recommended for consistent browser playback. MOV, WebM, MKV, and M4V containers are also accepted; codec support depends on the browser.
2. Keep **Subtitles only · keep the full video** (default), then choose **Generate bilingual subtitles**. For conservative cleanup, choose **Light trim · preserve the full explanation**. There is no target-length selector. Manual editing works without an AI key.
3. Review the source in/out points, opening hook, labels, and transcript. Change the plan and save it. Caption-only keeps the whole source; optional light trimming preserves the complete explanation. All aspect ratios support up to 20 minutes.
4. Optionally upload music you have rights to use. The track loops beneath source audio at a fixed 10% volume; this is not loudness normalization or automatic music discovery.
5. Render, then download the selected 9:16, 16:9 or 3:4, 30 fps H.264 MP4. Check framing, subtitles, and music levels before sharing.

**Explore with a sample** creates synthetic footage and demonstration captions; it does not call an AI service or represent a real coaching session.

## Enable automation

Copy `.env.example` to `.env` and supply `MCC_OPENAI_API_KEY` securely, or bind that variable in cloud environment settings. Never commit `.env` or put a key in the browser. Restart the server after changes.

Audio is extracted locally and submitted to [OpenAI's timestamped transcription endpoint](https://developers.openai.com/api/docs/guides/speech-to-text#timestamps), using the existing `whisper-1` adapter. Both English and Chinese are generated for each cue, including mixed-language speech. Translation and automatic cultural/meaning review receive the whole transcript in bounded batches. Caption-only skips planning. Optional light trimming sends the timestamped transcript and brief to the configured planner:

- `MCC_EDIT_PROVIDER=codex` (default): invokes `codex exec` in a read-only sandbox with an explicit JSON output schema. It receives the transcript over stdin and returns an edit plan without needing shell/file tools. The server's API binding is supplied to the non-interactive CLI as `CODEX_API_KEY`; an existing CLI login can also be used when that binding is absent. No generated commands or code are executed by the editor. The CLI's configured/default model is used.
- `MCC_EDIT_PROVIDER=openai`: uses the Responses API directly; `MCC_EDIT_MODEL` defaults to `gpt-4.1-mini`.

Both planners validate source boundaries and chronological cuts. Light trim has no target duration; a proposal retaining less than 80% of source runtime or 90% of transcript words falls back to the full video. Caption-only always uses the whole source. Automatic translation/review aims for idiomatic North American English and natural Simplified Chinese without changing the speaker's meaning or inventing context. Transcript recognition, cut relevance, and translation quality still need live evaluation. API usage can incur costs for full audio duration and translation/review passes.

Allow `api.openai.com` for transcription/API planning. Codex needs access to the destinations required by its configured authentication/provider. The UI and manual rendering run without these credentials. Neither live AI transcription nor Codex planning has been validated in this environment because no transcription key is present.

## Brand system

- Tokens: `src/brand.ts`; original supplied logos: `src/assets/`.
- Brand source: `docs/MCC-visual-system-v1.txt`, dated 2026-10-19 and marked **PROPOSED** in the supplied document.
- Black `#0D0D0D`, Gold `#C7A36B`, Ivory `#F5F2EB`, Graphite `#242424`, Stone `#A7A29A`, Espresso `#302820`.
- Inter and Noto Sans SC are installed and served locally, including during rendering. No Google Fonts request is needed.
- Original SVG artwork is preserved. Its surrounding transparent canvas is cropped for placement without modifying the mark.
- Vertical template: `src/remotion/Video.tsx`. Ivory subtitles with gold word highlights, restrained hook fade, clean cuts, and the official gold logo. No new slogan, offer, or CTA is added. An end card is left for an approved CTA.

Use Codex against this repository to refine layouts or editing rules in code; the runtime Codex planner changes edit data, not the template's application code.

## Validation

With the API running:

```bash
npm test                # edit-plan validation and pause tightening
npm run build           # TypeScript + production bundle
npm run smoke           # actual upload, music, multi-cut Remotion render, ffprobe assertions
npm run test:api        # private API, persistence, real ten-minute upload in all formats
npm run test:browser    # Chromium: sample, preview, edit/save, mobile overflow
npm run test:cloud      # isolated private server: sign in, close browser, restart, recover render
```

The smoke check creates synthetic footage, uploads it, rejects an invalid cut and a cross-origin write, uploads music, renders a five-second branded video, and verifies codec, dimensions, audio, and duration. Output: `.data/smoke-export.mp4`. Browser checks write desktop/sample/mobile screenshots under `.data/`. `REMOTION_BROWSER_EXECUTABLE` can override `/usr/bin/chromium`.

## Storage and scope

Uploads, project JSON, exports, and the SQLite job queue live under `MCC_DATA_DIR` (ignored `.data/` by default; `/var/data` on the cloud persistent disk). Keep this directory to retain projects. **Saved projects** lists work across browser sessions/devices. A serial server worker runs jobs independently of the browser; pending jobs survive a restart, and an interrupted running job is retried once. This design supports a single always-on service instance, not multiple replicas.

This version supports private studio sign-in, saved project browsing, durable background jobs, one source video per project, vertical/horizontal/portrait output with contain/crop framing, English/Chinese fonts, manually adjustable cuts/hooks/labels and bilingual subtitles, automatic contextual translation/review, uploaded music, and download. It does not yet provide face tracking, generated B-roll, automatic publishing, or resumable uploads. All signed-in users share one owner's workspace; per-user accounts/storage are needed for a multi-tenant product. Production refuses to start without a strong studio password and session secret. Use HTTPS, the persistent disk, and the deployment settings in the cloud guide.
