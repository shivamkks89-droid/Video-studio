"""Curated royalty-free music & SFX catalog.

Uses SoundHelix (Copyright-free, hotlink-friendly) for background tracks and
mixkit.co direct CDN URLs (which allow hotlinking) for a handful of SFX.

Confirmed working in the browser via `<audio src=...>` with no 403.
For a licensed commercial deployment, replace these URLs with tracks
hosted in your own object storage or a licensed provider (Epidemic Sound,
Artlist, etc.). The IDs are stable so swapping URLs is a one-line change."""

MUSIC_TRACKS = [
    {"id": "mx-cinematic-01", "name": "Cinematic Rise", "mood": "cinematic",
     "duration": 373, "bpm": 90,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"},
    {"id": "mx-uplifting-01", "name": "Uplifting Corporate", "mood": "corporate",
     "duration": 447, "bpm": 110,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"},
    {"id": "mx-emotional-01", "name": "Soft Emotional Piano", "mood": "emotional",
     "duration": 421, "bpm": 72,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"},
    {"id": "mx-energetic-01", "name": "Upbeat Vlog Groove", "mood": "energetic",
     "duration": 391, "bpm": 128,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3"},
    {"id": "mx-luxury-01", "name": "Luxury Slow Motion", "mood": "luxury",
     "duration": 372, "bpm": 80,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3"},
    {"id": "mx-storytelling-01", "name": "Story Ambient", "mood": "storytelling",
     "duration": 292, "bpm": 90,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3"},
    {"id": "mx-ugc-01", "name": "UGC Fresh", "mood": "ugc",
     "duration": 411, "bpm": 118,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3"},
    {"id": "mx-suspense-01", "name": "Trailer Suspense", "mood": "suspense",
     "duration": 246, "bpm": 100,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3"},
    {"id": "mx-motivational-01", "name": "Big Motivational", "mood": "motivational",
     "duration": 302, "bpm": 128,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3"},
    {"id": "mx-lofi-01", "name": "Chill LoFi Beat", "mood": "lofi",
     "duration": 397, "bpm": 88,
     "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3"},
]


# Mixkit direct URLs allow hotlinking for previews.
SFX_LIBRARY = [
    {"id": "sfx-whoosh", "name": "Whoosh", "category": "transition",
     "url": "https://assets.mixkit.co/active_storage/sfx/2205/2205-preview.mp3"},
    {"id": "sfx-pop", "name": "Pop", "category": "ui",
     "url": "https://assets.mixkit.co/active_storage/sfx/1084/1084-preview.mp3"},
    {"id": "sfx-click", "name": "Click", "category": "ui",
     "url": "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3"},
    {"id": "sfx-notification", "name": "Notification", "category": "ui",
     "url": "https://assets.mixkit.co/active_storage/sfx/1518/1518-preview.mp3"},
    {"id": "sfx-swipe", "name": "Swipe", "category": "transition",
     "url": "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3"},
    {"id": "sfx-impact", "name": "Cinematic Impact", "category": "impact",
     "url": "https://assets.mixkit.co/active_storage/sfx/2432/2432-preview.mp3"},
    {"id": "sfx-magic", "name": "Magic Sparkle", "category": "impact",
     "url": "https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3"},
]
