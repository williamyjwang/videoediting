# MCC editing pilot

This extends the existing app. The studio is not deployed yet. Local checks cost no hosting or API usage, but a local server requires the computer to remain running. Only the eventual hosted worker can continue after the computer is off.

## Available in this pilot

1. Upload footage up to 20 minutes / 2 GB or use the synthetic sample. The source starts as a complete timeline.
2. Choose **Subtitles only · keep the full video** (default), or **Light trim · preserve the full explanation**. There is no target duration. Then choose vertical 9:16 for short-form video, horizontal 16:9 for YouTube, or portrait 3:4. Choose whether to show the entire source frame or crop to fill.
3. Edit cut timestamps, the opening hook, and supporting labels. Preview uses the supplied MCC logo, colors, and bundled fonts. No brand artwork is regenerated.
4. Open **Bilingual captions**. Correct English and Chinese independently, edit source timestamps, add/delete cues, or import source-timed SRT. Review subtitle checks for missing speech coverage, empty languages, and reading speed. A silence between cues is allowed.
5. Save. Undo/redo is available for unsaved changes. After saving, edits persist on the configured data disk. SRT download follows the selected cuts and retimes subtitles into the output timeline.
6. Once rendering is validated on the target host, render a new MP4 after changing subtitles. Changing text does not require another AI prompt. A finished MP4 must be rendered again to include changes.

## First AI experiment — private key entry required

A short clear spoken clip can test API access cheaply; full videos up to 20 minutes are supported in the app. Set an API spending limit with the account owner before processing substantial footage. Do not paste an API key into chat or commit it. The 20-minute source limit does not enforce a currency budget. The previous 60-second pilot cap is removed.

The server transcribes the original English/Chinese speech, then generates both languages for every cue. A cue with code-switching is expressed completely in English on one line and completely in Chinese on the other. The translator receives the whole transcript for topic, terminology, pronouns, idioms and cultural meaning. Each batch then receives an automatic review pass for meaning and cultural context. It aims to reduce routine manual correction; local tests of the contract do not establish live translation quality.

Subtitles-only preserves the entire source and does not call the cut planner. Light trim retains the full explanation, with a guard against aggressive shortening. Existing complete corrected captions survive replanning; a missing language is generated while preserving existing corrected text. Successful transcription is saved before later AI work, reducing repeated transcription after a downstream failure.

The feedback field is stored with this project and passed into its next light-trim plan. It is not a model-training mechanism and does not yet propagate across projects.

## Before buying hosting

Run the final Docker image and render the synthetic sample on a compatible host. Verify the actual output dimensions, bilingual glyphs, sound, and cut boundaries. Then close the browser while a render is queued, restart the service with the same disk, and return in a fresh signed-in session to download it. The existing `test:cloud` automates this sequence when Chromium can launch.

Review Render's current compute/storage pricing and account billing state immediately before creating one service. The intended Blueprint is one standard Docker service with a 20 GB disk mounted at `/var/data`, `/api/health`, and one worker. Hosting payment and production secrets require the owner. No service has been purchased by this pilot.

## Later stages that need real sample review

A reusable cross-project reference library, repeatable preference versions, B-roll search/insertion, richer motion-graphics controls, and automatic selection of long-form versus short-form edits remain future work. Do not present these as implemented or as the system having learned a style. Use user-supplied reference videos and specific accept/reject feedback to choose those details before expanding the app.
