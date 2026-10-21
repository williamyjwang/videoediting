# MCC Studio development

- Work in this existing checkout. Cloud tasks are isolated; do not create a Git worktree unless requested.
- Keep supplied SVG artwork and `docs/MCC-visual-system-v1.txt` intact. Brand colors and font families are defined in `src/brand.ts` and `src/fonts.css`.
- The supplied visual document is a proposal. Do not invent official slogans, CTAs, coaching offers, student outcomes, or testimonials.
- Never commit `.env`, raw footage, transcripts, generated media, or keys. They belong in ignored `.data/` or environment settings.
- Do not execute model-generated code from an edit plan. Validate source timestamps and duration using `validatePlan` before persisting/rendering.
- Run `npm test` and `npm run build` for logic/UI changes. With `npm start` running, use `npm run smoke` for rendering changes and `npm run test:browser` for studio changes.
- All Remotion packages must use exactly the same version. Preserve the lockfile during dependency setup with `npm ci`.
- Missing AI credentials should leave manual editing and rendering available. Do not claim live transcription/planning was tested without actually calling them successfully.
- The user wants fully hosted editing, without local software installation or a computer left on. Deployment preparation is in `docs/CLOUD-DEPLOYMENT.md`, `Dockerfile`, and `render.yaml`. Do not present the onboarding preview/development server as a live hosted website.
- Cloud changes require `npm run test:cloud`: it exercises private login, persisted jobs, closing the browser, restarting the API, and returning to download a completed render. Use a single API/worker per persistent data directory.
