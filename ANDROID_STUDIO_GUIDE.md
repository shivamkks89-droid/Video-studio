# CineReel AI — Android Studio Build Guide (Hindi/Hinglish)

**Goal:** APK / AAB banayenge Capacitor ke through jo live `cinemaai.online` backend se connect hoga.

> **Note:** Sab commands **local machine** par chalao (Emergent container me nahi). Apne laptop/PC pe Android Studio + Java + Node install hona chahiye.

---

## ✅ 0. One-time Prerequisites (local machine)

Install karo (ek baar):

1. **Node.js 18+** & **Yarn**  
   ```bash
   node -v          # v18 or higher
   npm install -g yarn
   ```

2. **Java JDK 17** (Capacitor 7 ke liye zaroori)
   - Windows/Mac: https://adoptium.net/temurin/releases/?version=17
   - Verify:
   ```bash
   java -version    # 17.x
   ```

3. **Android Studio** (latest — Ladybug ya Koala)  
   Download: https://developer.android.com/studio  
   Install ke waqt ye components tick karo:
   - Android SDK
   - Android SDK Platform (API 34)
   - Android Virtual Device (emulator)
   - Android SDK Build-Tools 34.0.0+
   - Google USB Driver (Windows only)

4. **Environment variables set karo** (Windows: System Env / Mac: `~/.zshrc`):
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk        # Mac
   # OR (Windows PowerShell)
   $env:ANDROID_HOME="C:\Users\<you>\AppData\Local\Android\Sdk"

   export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin
   ```

Verify:
```bash
adb --version
```

---

## 📦 1. Code Pull karo (local machine par)

Emergent me app ke top-right corner me **"Save to Github"** button hai — usse pehle apna code GitHub par push karo. Uske baad local pe clone:

```bash
git clone https://github.com/<your-username>/<your-repo>.git cinereel
cd cinereel/frontend
```

---

## 📥 2. Frontend Dependencies install

```bash
cd frontend
yarn install
```

---

## 🔧 3. Backend URL confirm

`frontend/package.json` me already set hai:
```json
"mobile:build": "REACT_APP_MOBILE=1 REACT_APP_BACKEND_URL=https://cinemaai.online craco build"
```

Agar aap change karna chahe to yahin update karo.

---

## 🏗️ 4. Web Build + Capacitor Sync

Ye ek hi command me web bundle bana ke Android project me copy karega:

```bash
yarn mobile:sync
```

Behind the scenes ye chalta hai:
1. `craco build` → `frontend/build/` banata hai
2. `npx cap sync android` → build ko `android/app/src/main/assets/public` me copy karta hai + plugins update

**Pehli baar** agar `android/` folder nahi hai to pehle ye chalao:
```bash
npx cap add android
```

---

## 📱 5. Android Studio me Open karo

```bash
yarn mobile:open
```
Ya manually:
```bash
npx cap open android
```

Android Studio khulega. **Wait karo** jab tak Gradle sync complete na ho jaye (bottom bar dekho, 3–5 min lagega pehli baar).

---

## 🐞 6. Debug APK (Personal Testing)

### Option A — Android Studio se (recommended)
1. Top bar me device select karo (emulator ya USB-connected phone).
2. Green **▶ Run** button dabao (`Shift + F10`).
3. App phone/emulator me install ho jayegi.

### Option B — Command line se
```bash
cd android
./gradlew assembleDebug        # Mac/Linux
gradlew.bat assembleDebug      # Windows
```

APK yaha milega:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

Phone par install:
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 🚀 7. Release AAB (Play Store ke liye)

Play Store **AAB (Android App Bundle)** maangta hai, APK nahi.

### 7.1 Signing Key banao (ek baar)

```bash
cd android/app
keytool -genkey -v -keystore cinereel-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias cinereel
```

Password yaad rakho — 2 baar poochega (keystore password + key password). **Isko safe rakho, kho gaya to Play Store update nahi kar paoge!**

### 7.2 Gradle me signing config add karo

File: `android/app/build.gradle` — `android { ... }` block ke andar `buildTypes` ke UPAR add karo:

```groovy
signingConfigs {
    release {
        storeFile file("cinereel-release.jks")
        storePassword System.getenv("CINEREEL_STORE_PASS") ?: "YOUR_STORE_PASSWORD"
        keyAlias "cinereel"
        keyPassword System.getenv("CINEREEL_KEY_PASS") ?: "YOUR_KEY_PASSWORD"
    }
}
```

Aur `buildTypes.release` block me:

```groovy
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

> **Security tip:** Password env variable me rakho, hardcode mat karo. Terminal me:  
> `export CINEREEL_STORE_PASS="xxxxx"`  
> `export CINEREEL_KEY_PASS="xxxxx"`

### 7.3 Release Build banao

**AAB (Play Store upload ke liye):**
```bash
yarn mobile:aab
```
Ya manually:
```bash
cd android
./gradlew bundleRelease
```

Output:
```
android/app/build/outputs/bundle/release/app-release.aab
```

**Signed APK (direct install ke liye):**
```bash
cd android
./gradlew assembleRelease
```
Output:
```
android/app/build/outputs/apk/release/app-release.apk
```

### 7.4 Play Store Upload
1. https://play.google.com/console pe jao.
2. **Create app** → Details bharo (English + Hindi).
3. **Production → Create new release → Upload `app-release.aab`**.
4. Content rating, Privacy Policy URL, Screenshots (phone/tab) upload karo.
5. Submit for review (2–7 din).

---

## 🔄 8. Har baar code change ke baad

Backend ya frontend me change karne ke baad:

```bash
cd frontend
yarn mobile:sync         # rebuild + copy to android
yarn mobile:open         # Android Studio open
# ya
cd android && ./gradlew assembleDebug
```

---

## 🐛 9. Common Bugs & Fixes

### Bug 1: **Gradle sync failed / SDK not found**
→ Android Studio → **File → Settings → Appearance & Behavior → System Settings → Android SDK** — API 34 install karo.

### Bug 2: **"SDK location not found"**
File `android/local.properties` create karo:
```
sdk.dir=/Users/<you>/Library/Android/sdk       # Mac
sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk   # Windows
```

### Bug 3: **App white screen kholte hi**
- `cinemaai.online` reachable hai? Browser me check karo.
- Chrome DevTools se WebView debug karo: `chrome://inspect` → device select.

### Bug 4: **Mixed content / HTTP blocked**
Backend HTTPS pe hi hona chahiye. `capacitor.config.json` me `allowMixedContent: false` set hai (correct).

### Bug 5: **Microphone / Camera permission nahi maang raha**
File `android/app/src/main/AndroidManifest.xml` me `<application>` ke UPAR add karo:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.microphone" android:required="false" />
```

### Bug 6: **Login/API calls fail (CORS)**
Backend `cinemaai.online` me CORS me `capacitor://localhost` aur `https://localhost` allow karo.

### Bug 7: **App icon / Splash change**
- Icon: Android Studio → right-click `app/res` → **New → Image Asset**
- Splash: `capacitor.config.json` me color set hai, custom image ke liye `android/app/src/main/res/drawable/splash.png` replace karo.

### Bug 8: **`./gradlew` permission denied (Mac/Linux)**
```bash
cd android
chmod +x gradlew
```

### Bug 9: **Build fails: "compileSdk 33 required"**
`android/variables.gradle` me update:
```groovy
compileSdkVersion = 34
targetSdkVersion = 34
```

### Bug 10: **Version code bump (Play Store update ke liye)**
Har release me `android/app/build.gradle` me:
```groovy
defaultConfig {
    versionCode 2      // increment karo
    versionName "1.0.1"
}
```

---

## 📋 10. Quick Command Cheat Sheet

```bash
# Fresh setup (ek baar)
cd frontend
yarn install
npx cap add android

# Har build ke pehle
yarn mobile:sync                  # web build + android sync

# Debug APK
yarn mobile:open                  # Android Studio → Run
# ya
cd android && ./gradlew assembleDebug

# Release AAB (Play Store)
cd android && ./gradlew bundleRelease

# Release APK (direct install)
cd android && ./gradlew assembleRelease

# Install on connected device
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Logs dekhne ke liye
adb logcat | grep -i capacitor
```

---

## 🎯 Final Checklist Before Play Store

- [ ] `versionCode` aur `versionName` bump kiya
- [ ] Release keystore backup liya (2 jagah)
- [ ] Icon 512×512 + Feature graphic 1024×500 ready
- [ ] Phone screenshots (min 2, 1080×1920)
- [ ] Privacy Policy URL live hai
- [ ] `cinemaai.online` HTTPS + valid SSL
- [ ] Test AAB `bundletool` se local install karke verify
- [ ] Content rating questionnaire fill kiya

**Bas — sab set hai. Happy shipping! 🚀**
