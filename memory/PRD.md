# CineReel AI — PRD & Progress

## Original Problem Statement
Build a production-ready SaaS web application **"CineReel AI"** to create cinematic
marketing videos, social media reels, ads, YouTube Shorts, Instagram Reels, TikTok
videos and AI avatar videos for personal and commercial use. Dark UI like HeyGen / Runway / Canva.

## Architecture (MVP)
- **Frontend**: React (CRA) + Tailwind + shadcn/ui + lucide-react + sonner toasts + Outfit/Manrope/JetBrains Mono fonts
- **Backend**: FastAPI + Motor (MongoDB) + JWT (PyJWT/bcrypt) + httpx
- **AI**:
  - **Script / Hooks / CTAs / Ideas**: Claude Sonnet 4.5 via `emergentintegrations`
  - **Storyboard images**: Gemini `gemini-3.1-flash-image-preview` (Nano Banana) via `emergentintegrations`
  - **TTS voices**: ElevenLabs `eleven_multilingual_v2`
- **Email OTP**: Resend (also returns `dev_code` in dev)
- **Auth**: JWT email/password + Email OTP + Emergent Google OAuth (session cookie)
- **Billing**: Simulated Stripe via `/api/billing/purchase` (env has `STRIPE_API_KEY=sk_test_emergent`)

## What's Implemented (29-Feb-2026, MVP v1)
- Landing page (cinematic dark, hero, features, video-types, how-it-works, CTA, pricing link)
- Auth: signup, login, email OTP, Google OAuth (Emergent)
- Dashboard layout (sidebar + sticky header + credits chip)
- Dashboard home: AI ad-idea suggester (URL/Play Store ID/topic), recent projects, templates
- New Project flow (12 video types, 3 ratios, 3 languages, fps/res/duration)
- Script Studio: full script, 5 hooks, 5 CTAs
- Voice Studio: ElevenLabs multilingual + language filter + sliders
- Scene Studio: Nano Banana storyboards
- Project detail: end-to-end script → voice → storyboard pipeline
- Templates catalog (12), Brand Kit CRUD, AI Assets library (avatars, images, music, stickers)
- Credits & Usage history, Pricing page with 4 plans
- Admin Panel: analytics + users CRUD (role/plan/credits)
- Default admin auto-seeded: `admin@cinereel.ai` / `admin12345`
- 31/31 backend pytest passing; UI smoke tested

## Backlog (P0/P1/P2)
### P0
- Real Stripe Checkout (subscriptions + credit packs) — env key already provisioned
- Final video render pipeline (compose voiceover + storyboard + captions → MP4/MOV/GIF)

### P1
- Talking Avatar with lip-sync (HeyGen/Did integration)
- Timeline / drag-and-drop editor with subtitles & motion graphics
- Voice cloning consent flow (ElevenLabs custom voices)
- Team Workspace + Folder Management + Version History
- Background music auto-pick + sound effects library
- Captions auto-generated from voiceover transcript

### P2
- Cloudinary media uploads (logos, B-roll uploads)
- Mobile-app embedding (React Native shell)
- API access for Enterprise tier
- SSO for Enterprise
- Marketplace for community templates

## Known Constraints
- The provided ElevenLabs key appears to be on a Free tier — library voices return
  `paid_plan_required`. The TTS endpoint refunds credits and surfaces a friendly
  error. To make TTS work end-to-end, upgrade the ElevenLabs plan or clone a
  voice into the user's personal library.
- Stripe is simulated (no card is charged in preview); upgrade only assigns plan + credits.
