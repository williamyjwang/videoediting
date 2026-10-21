# MCC editing pilot

This extends the existing app. The studio is not deployed yet. Local checks cost no hosting or API usage, but a local server requires the computer to remain running. Only the eventual hosted worker can continue after the computer is off.

## Available in this pilot

1. Upload a short clip or use the synthetic sample.
2. Choose vertical 9:16 for short-form video, horizontal 16:9 for YouTube, or portrait 3:4. Choose whether to show the entire source frame or crop to fill.
3. Edit cut timestamps, the opening hook, and supporting labels. Preview uses the supplied MCC logo, colors, and bundled fonts. No brand artwork is regenerated.
4. Open **Bilingual captions**. Correct English and Chinese independently, edit source timestamps, add/delete cues, or import source-timed SRT. Review subtitle checks for missing speech coverage, empty languages, and reading speed. A silence between cues is allowed.
5. Save. Undo/redo is available for unsaved changes. After saving, edits persist on the configured data disk. SRT download follows the selected cuts and retimes subtitles into the output timeline.
6. Once rendering is validated on the target host, render a new MP4 after changing subtitles. Changing text does not require another AI prompt. A finished MP4 must be rendered again to include changes.

## First AI experiment — private key entry required

Use a clear 20–60 second spoken clip and a small API spending limit set by the account owner. Do not paste an API key into chat or commit it. The app's source-length limit does not enforce a currency budget.

The server extracts audio for transcription, selects cuts using the configured provider, and asks for a bilingual translation with the full cue transcript available together. Translation remains fallible. Listen through the original audio and check complete thoughts, names, technical terms, and meaning across cue boundaries. Tests of the request/response contract do not establish translation quality. Existing nonempty corrected captions are retained when regenerating the edit plan; clear them only when a fresh caption pass is intended.

The feedback field is stored with this project and passed into its next AI plan. It is not a model-training mechanism and does not yet propagate across projects.

## Before buying hosting

Run the final Docker image and render the synthetic sample on a compatible host. Verify the actual output dimensions, bilingual glyphs, sound, and cut boundaries. Then close the browser while a render is queued, restart the service with the same disk, and return in a fresh signed-in session to download it. The existing `test:cloud` automates this sequence when Chromium can launch.

Review Render's current compute/storage pricing and account billing state immediately before creating one service. The intended Blueprint is one standard Docker service with a 20 GB disk mounted at `/var/data`, `/api/health`, and one worker. Hosting payment and production secrets require the owner. No service has been purchased by this pilot.

## Later stages that need real sample review

A reusable cross-project reference library, repeatable preference versions, B-roll search/insertion, richer motion-graphics controls, and automatic selection of long-form versus short-form edits remain future work. Do not present these as implemented or as the system having learned a style. Use user-supplied reference videos and specific accept/reject feedback to choose those details before expanding the app.
