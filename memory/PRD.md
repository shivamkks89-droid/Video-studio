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

### Admin
- ✅ (Jun 2026) Admin API Keys (`/admin`): ELEVENLABS_API_KEY, FAL_KEY, EMERGENT_LLM_KEY — test-then-save, stored in `db.app_keys`, applied at runtime + on startup (routes_keys.py), revert to deploy key.
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
