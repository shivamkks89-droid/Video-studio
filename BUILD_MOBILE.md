# CineReel Android — Local Build & Play Store Deploy

## Prereqs (local machine)

1. **Node 20+**, **Yarn 1.22+**
2. **Android Studio** (Jellyfish or newer) — install from https://developer.android.com/studio
3. **Java JDK 21** (Android Studio bundles this; standalone OK too)
4. **Android SDK 35** + Build Tools 35 (Android Studio → SDK Manager)

## First-time setup

```bash
cd /path/to/cinereel/frontend
yarn install
```

## Build & run on connected device (debug)

```bash
yarn mobile:sync
npx cap run android
```

## Build a signed AAB for Play Store

### 1. Generate a keystore (only ONCE — keep it safe forever)

```bash
keytool -genkey -v -keystore cinereel.keystore \
  -alias cinereel -keyalg RSA -keysize 2048 -validity 10000
```

**⚠️ Backup this .keystore file to 2+ secure locations. Loss = you can never
update the app on Play Store.**

### 2. Configure signing in `android/app/build.gradle` — add before `buildTypes`:

```groovy
signingConfigs {
    release {
        storeFile file("../../cinereel.keystore")
        storePassword System.getenv("KEYSTORE_PASSWORD") ?: "YOUR_KEYSTORE_PASSWORD"
        keyAlias "cinereel"
        keyPassword System.getenv("KEY_PASSWORD") ?: "YOUR_KEY_PASSWORD"
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        // ... existing config ...
    }
}
```

### 3. Build

```bash
yarn mobile:aab
# → frontend/android/app/build/outputs/bundle/release/app-release.aab
```

Expected size: **~28-32 MB** (bundled premium content + Capacitor runtime + React app).

### 4. Upload to Play Console

1. Go to https://play.google.com/console
2. Create app → package: `ai.cinereel.app`
3. **Testing → Internal testing** first (invite yourself + 5 testers)
4. Upload the `.aab` file
5. Fill store listing (icon: `frontend/public/app-icon-src.png`, description, screenshots)
6. Roll out → 100% after internal QA passes

## Cloud CI Build (GitHub Actions)

The `.github/workflows/android-build.yml` workflow builds AABs automatically:

- **Manual trigger**: Actions tab → "Build Android AAB" → Run workflow
- **On tag push**: `git tag v1.0.0 && git push origin v1.0.0`

To enable **signed** builds, add these repo secrets:

- `ANDROID_KEYSTORE_B64` — `base64 -w0 cinereel.keystore` output
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` — usually `cinereel`
- `ANDROID_KEY_PASSWORD`

Artifacts download from the Actions run summary.

## Update the app later

1. Bump `versionCode` and `versionName` in `android/app/build.gradle`
2. Rebuild AAB
3. Upload to Play Console → new release

---

## Backend URL note

Mobile build uses **`REACT_APP_BACKEND_URL=https://video-studio-ai-38.emergent.host`**
(hardcoded in the mobile:build script). The mobile app hits your existing
production API — no separate mobile backend needed.

Change this if you deploy to a different domain.
