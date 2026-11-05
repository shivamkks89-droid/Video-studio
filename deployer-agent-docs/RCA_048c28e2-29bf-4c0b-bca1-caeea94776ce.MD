# RCA — "Render failed" on project "Bhai mere phone mein 47 apps hain... kyun?" (DailyHub AI)

## Scope
Deployment `video-studio-ai-38` (prod), active run `048c28e2-29bf-4c0b-bca1-caeea94776ce`, tier_0, DB `video-studio-ai-38-test_database`. Read-only production investigation. No deploy/manifest changes made.

## Identifying the project
The reported title "Daily hub ai" / regex `/daily hub/i` matched **no** project. The actual failing project (DailyHub AI promo video) is:
- `project_id`: **proj_0d0f4961458e**
- title (verbatim): **"Bhai mere phone mein 47 apps hain... kyun?"**
- aspect_ratio **9:16**, resolution **1080p**, fps **30**, duration_sec **82**
- audio_url present: `/api/files/audio/c71de251b40b42.mp3`
- scenes: 6 — durations **7.72, 44.64, 7.24, 6.97, 10.06, 5.86** (= 82.49s). **Scene index 2 is 44.64s long** (a single still image held for ~45s).
- current status: `voicing`

(Note: a *different* project `proj_cb12a3d72425` "daily utlity Ai" also matches "daily" but all 3 of its render_jobs are `complete` — not the failing one. Its scenes are only 6.62s each.)

## render_jobs for proj_0d0f4961458e
Two most-recent jobs FAILED, both with the FFmpeg error:
- `job_91830b454450` — status **failed**, created **2026-11-05T08:53:34Z**, video_url null
- `job_4761cdbd93c9` — status **failed**, created **2026-11-05T08:50:16Z**, video_url null
- Earlier jobs (11-03) left in `pending` with error null (abandoned, same project).

### Stored error (verbatim, as persisted in render_jobs.error — the stored value is itself truncated by the app):
```
Command '['/usr/local/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2', '-y', '-threads', '1', '-loop', '1', '-i', '/tmp/tmpy8ln0vni/scn_001.png', '-t', '45.04', '-r', 
```

## Backend logs (verbatim) — the full exception the DB field truncated
```
subprocess.TimeoutExpired: Command '['/usr/local/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2', '-y', '-threads', '1', '-loop', '1', '-i', '/tmp/tmpy8ln0vni/scn_001.png', '-t', '45.04', '-r', '30', '-filter_complex', "[0:v]split=2[fg][bg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=luma_radius=30:luma_power=1,eq=brightness=-0.15[bgb];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,scale=1404:2496,zoompan=z='min(zoom+0.0010,1.10)':d=1351:s=1080x1920:fps=30,format=yuv420p", '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '1', '/tmp/tmpy8ln0vni/scn_001.mp4']' timed out after 120 seconds
  File "/app/backend/server.py", line 1864, in _run_render_job
  File "/app/backend/video_renderer.py", line 521, in render_video
  File "/app/backend/video_renderer.py", line 338, in _work
    raise TimeoutExpired(
2026-11-05 08:56:20 - root - ERROR - [render job] failed
2026-11-05 08:53:00 - root - ERROR - [render job] failed
```
(Identical TimeoutExpired for the 08:50 job, tmpdir `/tmp/tmpcot0mg1_`.)

## Root cause (CONFIRMED)
`subprocess.run(..., timeout=120)` in `video_renderer.py:338 (_work)` raises **subprocess.TimeoutExpired after 120 seconds**. The command that times out is the **per-scene encode of scene index 2 (`scn_001.png`, `-t 45.04` ≈ its 44.64s duration)**. That scene is a 45-second still image encoded at 1080×1920 / 30fps (1351 frames, `zoompan d=1351`) through an expensive `filter_complex` (split → boxblur bg radius 30 → overlay → scale 1404:2496 → zoompan), libx264. With `-threads 1` and tier_0's **CPU limit of 250m (0.25 vCPU)**, this single-scene encode cannot finish inside the 120s subprocess timeout, so the scene step fails and the whole render fails.

This matches the reporter's TimeoutExpired hypothesis. The anomaly vs. other working projects is the **44.64s single scene** (working projects had ~6.6s scenes); the zoompan frame count (d=1351) scales directly with that duration.

### OOM ruled out
No `OOMKilled`, no exit code 137, no restarts on the serving pod (`...-gjtkc`, Running, ready, restart_count 0). The pod events show a *second* replica (`...-x9gk9`) scaling 1→2 at 08:54 that failed its startup probe with 503 / connection-refused and was scaled back to 1 at 09:02 — a boot/CPU-contention symptom during render load, NOT the render failure and NOT an OOM. So the failure is purely the 120s subprocess timeout, not memory.

### Why preview works in ~27s
Preview is not clamped to tier_0's 250m CPU limit, so the same long-scene encode completes well under 120s. Production throttles the ffmpeg process at 0.25 vCPU, so the long scene overruns the timeout.

## Tier at time of failure
tier_0 "Starter": cpu 50m request / **250m limit**, memory 200Mi / 512Mi, replicas 2, HPA/VPA off.

## Suggested fixes
1. **Code (E1, primary):** In `/app/backend/video_renderer.py` make long still-image scenes finish within budget — any of: raise the per-scene `subprocess.run` timeout (120s is too low for a 45s zoompan encode), use `-threads 0` (all cores) instead of `-threads 1`, lighten the filter (zoompan/boxblur are the cost drivers), and/or cap per-scene duration / chunk very long scenes. Scene 2 at 44.64s is the trigger.
2. **User — tier upgrade (contributing):** The encode is CPU-bound and throttled at tier_0's 250m CPU limit. Raising the tier (Deployment Panel → Resources) gives the ffmpeg process more CPU so long scenes finish faster — complements the code fix.
