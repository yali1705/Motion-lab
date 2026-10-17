| ID | Check | Result | Detail |
|---|---|---|---|
| ENG-1 | Engine unit tests (vitest) | PASS | 13 tests passed |
| SRV-1 | Render service health | PASS | authRequired=true browser=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell concurrency=2 |
| SRV-2 | Test composition validates (Zod) | PASS | 2 layers; invalid project → 400; over-limit project → 422 |
| SEC-1 | Render API requires the access key; download works via per-job token only | PASS | missing key → 401, wrong key → 401, security headers present |
| REN-1 | Render job completes (persistent job with progress) | PASS | job_20261017143939_psar2o in 27s, 143839 bytes, intermediate progress observed |
| REN-2 | MP4 downloads over HTTP | PASS | 143839 bytes -> qa/output/export.mp4 |
| REN-3 | MP4 is H.264 1080×1920 @ 60 fps, 300 frames, 5.000 s | PASS | h264 1080x1920 60/1 300 frames yuv420p |
| REN-4 | Exported motion matches the engine (frame 0 blank, headline rises, final hold) | PASS | YAVG f0=31.00 f40=35.91 f150=35.70 f299=35.70; centroid row f20=105.0 f60=92.6 |
| PAR-1 | Preview frames match exported frames (SSIM/PSNR within tolerance) | PASS | worst SSIM vs MP4 0.9997 (≥0.97), worst PSNR 51.4 dB (≥32), worst SSIM vs lossless still 1.0000 (≥0.99) |
| UI-0 | Export sheet asks for the render access key and accepts it (key stays on device) | PASS | key prompt shown, render disabled until a key is saved, key kept in localStorage only |
| UI-1 | Editor loads on iPhone viewport with the test composition | PASS | two layers rendered; Hebrew layer resolved to RTL; no horizontal overflow |
| UI-2 | Scrubbing the timeline by touch changes the frame and the preview | PASS | frame 0 -> 150; headline y 1130 -> 940 |
| UI-3 | Dragging the headline on the canvas repositions it (writes a Y keyframe at the current frame) | PASS | x +391.8px (static), new Y keyframe @150 = 352.2 (scale 0.102) |
| UI-4 | Undo / redo restore the drag | PASS | undo restored x=540 and 2 keyframes; redo reapplied; undone again |
| UI-5 | Editing text (Hebrew) updates the canvas and switches to RTL | PASS | canvas shows Hebrew with dir=rtl; persisted; restored to original |
| UI-6 | Keyframes: toggle a rotation keyframe, add a second via the inspector, animation interpolates | PASS | rotation keyframes @120=0 and @240=45 → frame 180 renders rotate(22.50deg) |
| UI-7 | Easing editor changes the interpolated value | PASS | frame 180: linear 22.50° → ease-in 5.98°; handle touch-drag set x1≈0.3 |
| UI-8 | Keyframe drag in the timeline moves it to a new frame; delete removes it | PASS | dragged 240 → 200; deleted; 1 rotation keyframe remains |
| UI-9 | Playback advances frames at project fps and pauses | PASS | ~1 s of playback advanced to frame 64 (60 fps clock), paused cleanly |
| UI-10 | Timeline collapses and expands | PASS | height 220 → 36 → 220 |
| UI-11 | Add a text layer, select it, reorder and delete it | PASS | added 3rd layer, moved behind, deleted |
| UI-12 | Project persists across reload (edits + current frame) | PASS | text, keyframes and current frame (90) survived reload |
| UI-13 | Export from the editor: job progress shown, MP4 downloadable | PASS | rendered via UI in 29s; /api/jobs/job_20261017144038_8nfc40/download?t=pSPr4QRAA4EeWd44Jq_Cu-yaQPWpH1jF → 200 video/mp4 |
