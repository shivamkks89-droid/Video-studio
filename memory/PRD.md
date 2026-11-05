# CineReel AI — Product Requirements Document

## Vision
Production-ready SaaS platform to create cinematic marketing videos, social reels,
AI-avatar videos and full multi-platform ad campaigns — optimised for Indian
creators, businesses, agencies and advertisers. Target hybrid of HeyGen + Runway +
InVideo AI + CapCut + Canva AI.

## Personas
- **Solo creators** — need fast Hindi/Hinglish reels for IG/YT/TikTok
- **D2C brands** — need a full multi-platform campaign in one click
- **Agencies** — need client workspaces, version history, campaign packs
- **App marketers** — need Play Store scraping + product-first ads

## Core Modules (state)

### Auth & Users
- ✅ Email/password + Email OTP + Emergent Google session
- ✅ Admin role + Admin panel + analytics
- ✅ Credit system (per-action pricing + refund-on-failure + history)

### AI Creation
- ✅ Script Studio (Claude-Sonnet 4.5) — 3-axis variants + AI success predictor
- ✅ Manual Script Editor with Improve/Shorten/Expand/Change-tone/Translate/Split-scenes (`/api/ai/script/refine`)
- ✅ Voice Studio — ElevenLabs multilingual v2 + OpenAI TTS fallback + hover-preview
- ✅ **Upload My Voice** (MP3/WAV/M4A/AAC/OGG up to 30 MB, `/api/media/upload-voice`)
- ✅ Voice cloning UI (ElevenLabs Voice Lab)
- ✅ Scene / Storyboard generator (Gemini Nano Banana + real Play Store screenshots)
- ✅ Ad Ideas generator (`/api/ai/ad-ideas`, 6 concepts w/ real brand assets)
- ✅ Hook + CTA generators
- ✅ Multi-creative generator (1/3/5/10/20 distinct variants, `/api/ai/multi-creative`)
- ✅ Ad Copy generator (Meta/Google/YouTube/TikTok/LinkedIn/Snapchat/X/Pinterest, `/api/ai/ad-copy`)
- ✅ Multi-platform Campaign builder (`/api/ai/campaign`)
- ✅ Creative Score (Hook/Message/Visual/CTA/Platform, `/api/ai/creative-score`)
- ✅ Compliance Assistant (Low/Medium/High risk, `/api/ai/compliance`)
- ✅ STT / Whisper (`/api/ai/stt`) — transcript + segments + auto-scene split

### Video Engines
- ✅ ffmpeg dynamic ken-burns renderer (auto-tightens voice to video length)
- ✅ Sora 2 (Free tier) text-to-video
- ✅ fal.ai Seedance (Premium) text-to-video + image-to-video
- ✅ Object-storage-backed asset store (survives pod restarts)

### Ad Studio & Campaigns
- ✅ Ad Studio page (`/dashboard/ad-studio`)
- ✅ Client Workspaces (`/dashboard/workspaces`) — create / assign projects / colour tag
- ✅ Version history + restore (`/api/projects/{id}/versions`)
- ✅ Smart Format Resizer (`/api/projects/resize`) — 9:16, 16:9, 1:1, 4:5
- ✅ Complete Campaign Pack export (`/api/projects/{id}/campaign-pack` → ZIP)
- ✅ Music & SFX library (10 tracks + 7 SFX, hotlink-friendly URLs)
- ✅ Estimated Credits pricer (`/api/ai/estimate`)

### Payments
- ✅ (Jun 2026) Razorpay one-time 30-day plans (INR): Starter ₹499/400cr, Creator ₹1,499/1500cr, Pro(studio) ₹3,999/5000cr, Agency(enterprise) ₹15,999/25000cr. `payments_razorpay.py`: POST /api/billing/razorpay/order, /verify (HMAC signature, atomic idempotent grant), /webhook (active only if RAZORPAY_WEBHOOK_SECRET set), GET /billing/payments. Old /billing/purchase blocks paid plans for non-admins. Pricing.jsx loads checkout.js. Test-mode keys.

- ✅ (Jun 2026) Plan expiry reminder: `PlanExpiryBanner` in DashboardLayout (≤3 days left or expired, one-tap Renew via shared `lib/razorpay.js` startRazorpay); `plan_expires_at` exposed in UserPublic.

- ✅ (Jun 2026) Auto downgrade: `auth._auto_downgrade` on every authenticated request — expired paid plan → free (stores previous_plan, downgraded_at); credits/projects untouched; admins/unlimited skipped. Banner shows expired + Renew previous plan.

- ✅ (Jun 2026) Motion graphics + transitions in main render (video_renderer.py): per-scene animated headline (`on_screen_text`, AI script now outputs it) burned via ASS (slide-up + fade, volt box; bundled ffmpeg has no drawtext) + xfade transitions (fade/slideleft/smoothup/circleopen/wipeleft/dissolve, 0.4s) timeline-neutral (scenes padded by overlap → total = sum of scene durations, audio sync intact). Flags motion_text/transitions default True; falls back to concat.

- ✅ (Jun 2026) Free plan limit: max 2 distinct videos per account (`_check_free_video_limit` in render endpoint, `users.video_projects` addToSet on success; existing users baselined from projects with video_url; re-render same project allowed; admins/unlimited/paid exempt). 402 → Upgrade toast. Free plan feature text "2 videos total".

- ✅ (Jun 2026) Free videos counter on Dashboard (`GET /api/me/free-videos`, `FreeVideosCounter.jsx`: "X of 2 free videos left" + progress + Upgrade).

### Audio Sync
- ✅ (Jun 2026) WhatsApp share for finished videos (`ShareVideoWhatsApp` next to Download MP4 in ProjectDetail): shares MP4 file via Web Share where supported, else WhatsApp message with video link.
- ✅ (Jun 2026) WhatsApp share for scripts (`ShareWhatsAppButton` in ScriptClipboard.jsx; native → whatsapp://send, web → wa.me). On ProjectDetail script + ScriptStudio result.
- ✅ (Jun 2026) Script copy/paste: `components/ScriptClipboard.jsx` (CopyScriptButton full script incl. scenes/hashtags, PasteScriptBox, textToScript parser HOOK/BODY/CTA or sentence split). Wired: ProjectDetail script + each variant card + paste-my-script (PUT project script); ScriptStudio result copy + manual editor Paste/Copy.
- ✅ (Jun 2026) Android "Share → CineReel" for audio (AI Awaaz etc.): manifest SEND audio/* intent-filter, native `ShareTargetPlugin.java` + MainActivity.handleShare (copies to cache, emits `audioShared`), `components/SharedAudioHandler.jsx` → Voice Studio auto-upload. Needs native rebuild; device test pending.
- ✅ (Jun 2026) Word-level timing: Whisper `timestamp_granularities=[word,segment]` (stt_service) → captions + audio-sync use real word times (precision "word").
- ✅ (Jun 2026) Scene count selector 3–12 in ProjectDetail script section (`scene_count` on ScriptRequest/VariantsReq; default 6).
- ✅ (Jun 2026) Uploaded audio ↔ script match (`POST /api/projects/{id}/audio-match`: match %, exact/partial/different, missing/extra words, diff tokens, silences, precision) + scene sync (`POST /api/projects/{id}/audio-sync` mode keep/replace_script; durations snapped to phrase ends; exact uploaded audio used, no TTS). UI: AudioMatchPanel in Voice Studio → Upload mode after Transcribe. Module: backend/audio_sync.py.

### Admin
- ✅ (Jun 2026) Admin API Keys (`/admin`): ELEVENLABS_API_KEY, FAL_KEY, EMERGENT_LLM_KEY — test-then-save, stored in `db.app_keys`, applied at runtime + on startup (routes_keys.py), revert to deploy key.
- ✅ (Jun 2026) Key Change Log on /admin (`GET /api/admin/keys/log`, db.app_key_log: who/when/changed-or-reverted/masked).
- ✅ (Jun 2026) Voice Quota Meter in Voice Studio (`GET /api/voice/quota`, 60s cache; needs ElevenLabs key with User→Read).

### Mobile
- ✅ (Jun 2026) Android Google sign-in: system browser → /app-auth bridge → cinereel://auth deep link (manifest intent-filter) → appUrlOpen → AuthCallback; /auth/google/session now also returns token (Bearer) for WebView.
- ✅ (Jun 2026) Dark Android system nav bar fix: MainActivity insets (bars + IME) + dark decor/theme; adjustMarginsForEdgeToEdge=disable. Needs native rebuild; device test pending by user.
- ✅ (Jun 2026) Android back button: single listener `components/BackButtonHandler.jsx` (closers stack `lib/backStack.js` → Radix layer Escape → history back → root double-press exit 2s). Exit guard while rendering. Debug sim on web: localStorage.debugNativeBack=1 → window.__simulateBack().
- ✅ (Jun 2026) In-app Recent projects (`GET /api/projects?sort=recent`, `last_opened_at` set on project open) on Dashboard.
- ✅ (Jun 2026) Mobile overflow root-cause fix: `grid grid-cols-1` + `.grid > * {min-width:0}`; content padding above bottom nav; 44px hamburger/close; Landing hero text-first on mobile; native app skips Landing; adjustResize + adjustMarginsForEdgeToEdge.
- ✅ (Jun 2026) Client Brand Kit per workspace (logo upload `POST /api/workspaces/{id}/logo`, primary/secondary colour, font sans/serif/mono saved in `workspace.brand_kit`) + renders strip on workspace cards. Brand kit applies to screenshots + feature graphic.
- ✅ (Jun 2026) Screenshot layouts: classic / tilted / duo / callout (`layout` form field, callout uses `points`).
- ✅ (Jun 2026) Feature graphic auto text overlay (app name + tagline, brand font) → `feature_text_url`.
- ✅ (Jun 2026) 30s promo MP4 from 6 screenshots w/ xfade + library music, 5 CR, background job (`POST /api/studio/playstore-screenshots/{id}/promo`, poll `GET .../{id}`).
- ✅ Android Adaptive Icon (fg + bg + monochrome layers, all densities) installed in `frontend/android/.../res` + ZIP (`GET /api/studio/adaptive-icon.zip`, previews `/api/studio/adaptive-icon/preview/{layer}.png`). Duplicate `values/ic_launcher_background.xml` removed.
- ✅ Play Store Screenshot Generator (6x 1080x1920, phone frame + headline; source = project video frames OR uploaded app screens; brand-dark / multi-colour bg). AI headlines 2 CR (`POST /api/studio/playstore-screenshots/headlines`), compose free (`POST /api/studio/playstore-screenshots`), ZIP (`GET /api/studio/playstore-screenshots/{id}/zip`). UI on `/dashboard/playstore`.
- ✅ Capacitor Android wrapper (~28 MB AAB)
- ✅ GitHub Actions workflows for APK/AAB

## Environments / Secrets
- `EMERGENT_LLM_KEY` — Claude / Whisper / Gemini / OpenAI TTS
- `ELEVENLABS_API_KEY` — REQUIRED for authentic Indian voice; OpenAI TTS falls back if invalid
- `MONGO_URL` / `DB_NAME` — Mongo
- `FAL_KEY` — Seedance (optional)

## Backlog (P0 → P2)

### P0 (blockers)
- **ElevenLabs API key** currently invalid in `.env` — user must paste a real `sk_...`
  key to unlock authentic Indian accent (fallback to OpenAI works but is US-English)

### P1
- Subtitles/Captions burned into video via ffmpeg (`video_renderer.py` drawtext + word timing from Whisper)
- Estimated Credits confirm-modal wired into ProjectDetail render / storyboard / seedance buttons
- Master Asset caching — hash script + scene prompts; skip regen when unchanged
- Full backend refactor: `server.py` → `routes/auth.py`, `routes/projects.py`, `routes/ai.py`, etc. (currently 1720 lines)

### P2
- Avatar Studio (audio-driven lip-sync via HeyGen or similar 3rd party)
- Visual Timeline Editor (multi-track: video/voice/music/sfx/text/captions/overlay)
- Product URL general scraper for arbitrary websites (already partly implemented, needs richer parsing)
- Templates library expansion (Dating / E-commerce / SaaS / RealEstate / Restaurants / Fitness / Festivals)

## Recent Changes
- **Feb 2026 — Shipping Kit shipped**:
  - **Lipsync Muxing**: fal.ai talking-avatar MP4 now composited into final ffmpeg render — full-screen or PiP overlay (BR/BL/TR/TL). New endpoints `POST /api/avatars/lipsync` (auto-saves to project), `POST /api/projects/lipsync/mode`, `POST /api/projects/lipsync/clear`. `talking_avatar_url` + `talking_avatar_mode` on Project.
  - **Campaign Ad Pack**: one-click 5-platform variations at `POST /api/ai/campaign-quick` (IG Reel, YouTube Ad, TikTok, YouTube Short, LinkedIn Ad). 12 CR flat. Wired into ProjectDetail.
  - **Play Store Kit**: new page at `/dashboard/playstore`, endpoint `POST /api/studio/playstore-assets` — generates 512×512 icon + 1024×500 feature graphic via Nano Banana. Client-side resize to exact PNG dims on download. 12 CR total.
  - **Aspect Ratio Export**: 4:5 (1080×1350) added to `_aspect_dims`. UI in ProjectDetail: "Render all 4 formats" one-click + per-ratio chips (9:16 Reels, 16:9 YouTube, 1:1 Feed, 4:5 IG Portrait). Talking avatar & captions carry across all ratios.
  - **Android Studio build guide** at `/app/ANDROID_STUDIO_GUIDE.md` — Hindi/Hinglish, debug APK + Play Store AAB.
- **Feb 2026** — Phases 1-4 shipped in one session:
  - Ad Studio + Multi-Platform Campaign + Ad Copy + Format Resize
  - Multi-creative + Creative Score + Compliance
  - Upload My Voice + Whisper STT + auto-scene-split
  - Music & SFX library + Client Workspaces + Version history + Campaign Pack ZIP
  - Manual Script Editor with 6 AI refine actions
  - TTS fallback restored so voiceover never dies even with invalid ElevenLabs key

## 2026-06 — CinematicTextRenderer
- `frontend/src/components/CinematicTextRenderer.jsx`: single-file Canvas kinetic text (dark bg, ambient light, particle dust, rAF synced to audio, active-word pop + color, vertical timeline), MediaRecorder 1080x1920 export (MP4, WebM fallback).
- Test page `/dashboard/kinetic` (`pages/KineticTest.jsx`): script, audio link/file, auto timing, JSON timestamps. Screenshot-tested: recording + MP4 download OK in Chromium.
- Project Detail "Kinetic Video" button (`components/KineticVideoPanel.jsx`): plays project script + `caption_words` as kinetic text; colour picker, font select, brand-kit apply; WhatsApp share after record (Web Share file or wa.me fallback).
- Auto exact word timing: on any project audio change (PUT /projects, /media/upload-voice with project_id, audio-sync) backend task `_auto_word_timing` (server.py) transcribes and saves `caption_words` + `word_timing_status` (pending/ready/failed). audio-sync reuses provided words without extra STT. Shared normalizer `stt_words` in stt_service.py.
- Kinetic v2: scene images as Ken-Burns crossfade background, animation styles pop/slide/typewriter, brand-kit logo watermark (top-right), "Project me save karo" button → POST /api/projects/{id}/kinetic-videos (stored in `kinetic_videos`, last 20, webm/mp4).
- 2026-06 Render sync fix: render now uses `aligned_timings` (audio_sync.py) — content-matches each scene's voiceover to transcript word timestamps and cuts exactly where that scene's words begin; waits/creates word timing before render (`_ensure_word_timing`). Renderer: scenes without image extend previous scene (no timeline loss), clip scenes use scene duration (tpad 90s), 12s still cap raised to 90s — removes drift and voice speed-up.
- 2026-06 Firebase (scope: connect only, app unchanged — MongoDB/JWT/Razorpay untouched). Project `cinereel-b1d2a`. Android: `android/app/google-services.json` (package ai.cinereel.app matches), firebase-bom 33.7.0 + analytics in app/build.gradle (gms plugin 4.4.2, AGP 8.7.2, Gradle 8.11.1). gradle-wrapper.jar present & sha256 matches official 8.11.1 but is untracked in git (not in exports) — user restores locally from GitHub raw v8.11.1. Web: `src/lib/firebase.js` init from REACT_APP_FIREBASE_* env (apiKey via secrets card), analytics on web only. Full Firestore/Firebase Auth/Storage migration NOT done (needs separate phased plan).
- 2026-06 Firebase phase 2: `backend/firebase_service.py` (admin from FIREBASE_SERVICE_ACCOUNT_JSON secret, bucket FIREBASE_STORAGE_BUCKET). `POST /api/auth/firebase` (verified email only → maps to existing Mongo user by email, else creates; returns existing JWT) — tested e2e incl. 403 unverified. `POST /api/push/register` + FCM push on render complete (`_push_render_done`); frontend `FirebaseTracker.jsx` registers push on native (@capacitor/push-notifications 7) + logs screen_view; events render_video, kinetic_record, login. Login page 4th tab FIREBASE (`FirebaseEmailAuth.jsx`: login/signup+verify/reset). Storage: new audio/videos go to Firebase Storage `cinereel/{kind}/` if bucket works, else fall back to Emergent storage — bucket currently returns 404 (Storage not enabled in Firebase console).
- 2026-06 Firebase phase 3: live render status in RTDB `render_status/{user_id}/{job_id}` (queued/rendering/complete/failed) written server-side (`_job_live`); client signs into Firebase via `GET /api/firebase/token` custom token (uid = Mongo user_id) and listens (`components/LiveRenderStatus.jsx`, shown under Render button). RTDB rules deployed (owner read only, no client write) — tested owner/other/anon. Rules files in `/app/firebase/` (firestore.rules, storage.rules, database.rules.json, firebase.json); Firestore/Storage rules must be pasted in console (service account lacks rules permission; Firestore DB + Storage bucket not created yet). Data stays in MongoDB.
- 2026-06 Google login switched from Emergent auth to Firebase Google: web `signInWithPopup`, Android native via @capacitor-firebase/authentication 7 (skipNativeAuth, `rgcfaIncludeGoogle=true` in variables.gradle, plugin config in capacitor.config.json) → `POST /api/auth/firebase`. Consent shows cinereel-b1d2a.firebaseapp.com. Preview domain added to Firebase authorized domains via API. Android Google needs SHA-1 + refreshed google-services.json + rebuild.
- 2026-06 Old Emergent Google login removed: `/api/auth/google/session`, Emergent session lookup in auth.py (only JWT bearer now), AuthCallback/AppAuthBridge pages, cinereel://auth deep link + manifest intent, user_sessions cleared. All old Google sessions logged out (user choice). Google login = Firebase only.
- 2026-06 Login page welcome-back note; WelcomeCredits dialog on dashboard for new Firebase sign-ups (/auth/firebase returns is_new → localStorage cinereel_welcome); Settings 'Test phone alert' button → POST /api/push/test. Google consent app name to be set by user in Google Cloud Branding.
- 2026-06 Fix: Android build crash 'reading container' — local builds lack .env Firebase vars; firebase.js now lazy getFirebaseApp() loading public config from GET /api/firebase/config (backend FIREBASE_WEB_CONFIG) when env missing.
- 2026-06 Public /privacy page (pages/Privacy.jsx, contact Shivamkks986@gmail.com), linked from Landing footer + Auth page.
- 2026-06 /terms page (pages/Terms.jsx) linked in footer + auth. Settings 'Delete my account' → POST /api/account/delete sets delete_after (+7d); any authenticated request (login) restores; purge_deleted_accounts() runs on backend startup + each /auth/login (deletes projects/jobs/kits/etc, anonymizes credit_transactions, removes Firebase user + RTDB). Tested. Google login errors mapped to Hindi help toasts.
- 2026-06 Play Store kit: scripts/playstore_kit.py (Playwright real-screen capture, 8 screens × phone 1080x1920 / 7in 1200x1920 / 10in 1600x2560, Hinglish+English framed, raw, icon 512, feature 1024x500) → backend/static/kit zip, served GET /api/playstore-kit.zip. Fixed null script crash in KineticVideoPanel/ScriptClipboard.
- 2026-06 Fix: Android Google login 'not implemented' — native plugins (firebase-authentication, push-notifications) were not registered in android/capacitor.settings.gradle & app/capacitor.build.gradle; ran 'npx cap update android'. Auth toast now shows raw error code. google-services.json still lacks Android OAuth client (SHA not added).
- 2026-06 Android Google 'No credentials available' fix: signInWithGoogle({ useCredentialManager: false }) → classic Google account picker.
- 2026-06 Promo video 1920x1080 29.4s (8 english phone shots, zoom + slide transitions, synthesized original music) at backend/static/kit/cinereel-promo-30s.mp4, served GET /api/promo-video.mp4.
- 2026-06 Release signing: app/build.gradle loads android/key.properties (gitignored, with *.jks/*.keystore) → signingConfigs.release; explicit debug config. Template android/key.properties.example. Not Gradle-verified in cloud (no Android SDK).
- 2026-06 Fix Android ERR_NETWORK: CORS '*' + credentials returned 'Access-Control-Allow-Origin: *' on non-cookie requests (WebView rejects with withCredentials). Now allow_origin_regex='.*' echoes origin when CORS_ORIGINS='*'. Needs deploy.
- 2026-06 Admin: fraud detection (backend/fraud.py: disposable email, >3 accounts per X-Device-Id/IP, >=6 renders/10min, Razorpay bad signature / payment reuse / amount mismatch via payment.fetch) → fraud_alerts; GET /api/admin/fraud, POST resolve, POST /api/admin/users/{id}/block (blocked users 403 in auth.py). App version: admin_settings{key:app} via PUT /api/admin/app-settings, public GET /api/app/version; AppUpdatePrompt (native, skippable per version). UI: AdminFraud, AdminAppSettings, Block buttons. Tested via curl.
- 2026-06 Fraud email alerts (Resend, admin_settings key=fraud alert_email; Resend test mode only delivers to shivamkks545@gmail.com), auto-block on N+ accounts per device (configurable), GET /api/admin/revenue (monthly paid payments, new vs renewals, active plans) + AdminRevenue/AdminFraudSettings UI. Hinglish promo /api/promo-video-hinglish.mp4 via scripts/promo_video.sh.
- 2026-06 Churn: GET /api/admin/churn (last paid payment +30d expired within last 30 days, no newer payment) + POST /api/admin/churn/{id}/winback email; AdminChurn UI. Daily fraud summary cron (.emergent/crons.yml daily-fraud-summary 11:00 Asia/Kolkata → POST /api/cron/fraud-summary, WEBHOOK_CRON_SECRET bearer, cron_runs idempotency). Emails blocked by Resend test mode unless alert_email=shivamkks545@gmail.com or domain verified.
- 2026-06 Theme: Auto (follows phone/browser prefers-color-scheme) / Light / Dark — lib/theme.js (html.light/.dark class, localStorage cinereel_theme), theme-light.css remaps dark utility palette; .keep-dark + from-black gradients stay dark over photos. ThemeToggle in Settings. PasswordInput eye toggle on login/signup/Firebase/admin keys.

## 2026-06 — Light polish + Admin password change
- theme-light.css: status colours (red/amber/emerald/sky), hover states, volt borders/tints, translucent nav bars, placeholders, select options tuned for light mode.
- POST /api/admin/change-password (current + new ≥8 chars). Sets password_changed_at; JWTs issued before that are rejected (other devices logout). Returns fresh token.
- Admin panel → "/ ADMIN PASSWORD" card (components/admin/AdminPassword.jsx), with show/hide eyes.
- Tested: curl (wrong/short/success/old-token 401/new-token 200/revert), light-mode screenshots of Dashboard + Admin.

## 2026-06 — Forgot password + mobile theme check
- POST /api/auth/password/forgot (no user enumeration, bcrypt-hashed 6-digit code, 10 min) and POST /api/auth/password/reset (5 wrong tries max, sets password_changed_at → old JWTs 401, returns fresh token). Collection: password_resets.
- Login screen "Password bhool gaye?" → components/ForgotPassword.jsx (testids forgot-*). Auth tabs fit 390px mobile. Settings email no longer capitalized.
- Verified: curl full flow + mobile (390px) light/dark screenshots of Login/Forgot, Dashboard, Voice Studio, Settings, Pricing.
- FIXED (2026-06): /api/auth/otp/request never returns the code (503 if email fails); /auth/otp/verify locks after 5 wrong tries.
- Email limit: Resend test mode only delivers to the account-owner address until a domain is verified.
- 2026-06: Android minSdkVersion 23 → 24 (variables.gradle).
- 2026-06: targetSdk/compileSdk 35 → 36, AGP 8.7.2 → 8.10.1 (Gradle 8.11.1 unchanged).
- 2026-06: System bars follow app theme on Android (ShareTargetPlugin.setSystemBars called from theme.js). Edge-to-edge insets already handled in MainActivity.

## 2026-11 — Render failure + sync + phone screen + mobile header
- ROOT CAUSE (prod, deployer RCA): ffmpeg subprocess TimeoutExpired (120s) on a 44.6s still scene under 250m CPU (tier_0). Fix: timeouts scale with video length (120 + 6×total s), cheaper still-scene motion (single-frame + loop + crop pan instead of per-frame zoompan, ~40% less CPU), -threads 0. Timeout no longer raises; logged server-side.
- Failed renders: _render_failed() → friendly Hinglish error, refund 10 CR exactly once, error_detail kept server-only; stale pending jobs >30 min auto-failed+refunded. Frontend: Retry action + overlay, in-app final video player, rendering overlay, 25-min poll window.
- Sync: final MP4 length = voice length (-t voice_dur); no more atempo speed-up of original voice; if voice longer, last frame held (tpad). Verified 33.03s video vs 33.04s voice.
- Phone accuracy: phone_mockup.py composites REAL screenshots in a phone frame (real scenes) and overlays a real-screen phone on AI scenes whose prompt mentions phone/app (prompt asks AI to keep its phone screen hidden). Storyboard sets scene.phone_screen_url. No extra AI calls.
- Android: status/nav bar colour distinct from header (#000 dark / #E4E4DF light), header box-content + stronger border.
- Limitation: tier_0 CPU is slow; long (60s) renders may take several minutes. Upgrade tier in Deployment → Resources for faster renders.
- 2026-11: Status bar icon contrast fix — removed Capacitor StatusBar DARK config + splash immersive (they reset icons to white); MainActivity.applyBars() single source, re-applied onResume/focus/after splash hide.
- 2026-11: Render speed — xfade transitions now encoded in the same final pass as captions/tpad/audio (_single_pass in video_renderer.py), removing one full-length encode. Talking-avatar renders keep the old 2-pass path.
- 2026-11: Render progress % + ETA (render_jobs.progress/eta_s via ffmpeg -progress; overlay bar in ProjectDetail). Push/browser ready notification opens project with ?play=1 → autoplay.
- 2026-11: Phone scenes — AI prompt now forbids any phone/screen in AI images (real screenshot phone overlaid at render). Scene sync — aligned_timings keeps only monotonic anchors and interpolates missing cuts (no more giant/tiny scenes). Quality — scenes crf16 + lanczos scaling, final crf18 ultrafast 30fps (render time ~same).
- 2026-11: Per-scene phone position (scene.phone_pos left/center/right, default right) — L/C/R buttons on AI+REAL SCREEN cards, saved via PUT /projects/{id}, used by phone_mockup.overlay_phone.
- 2026-11: Robust background renders — render args stored on job, _bg() keeps strong task refs, RENDER_SEM queue (1 at a time), resume pending/rendering jobs on startup (max 2 attempts, then fail+refund), stale fail after 90 min. GET /api/projects/{id}/render/active; ProjectDetail re-attaches progress on open/resume. Android largeHeap=true.
