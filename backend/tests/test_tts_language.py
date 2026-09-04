"""TTS accent/language_code tests (Hindi/Hinglish accent fix).

Covers:
- ai_services.project_language_to_iso mapping
- ai_services.synthesize_speech accepts language_code kwarg
- POST /api/ai/tts for hindi / hinglish / english projects
- POST /api/ai/tts/preview caching
- GET /api/catalog/voices structure regression
"""
import inspect
import os
import sys

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@cinereel.ai", "password": "admin12345"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def headers(session):
    r = session.post(f"{API}/auth/login", json=ADMIN, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


created_projects = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(session, headers):
    yield
    for pid in created_projects:
        session.delete(f"{API}/projects/{pid}", headers=headers, timeout=60)


def _make_project(session, headers, language):
    r = session.post(f"{API}/projects", headers=headers, timeout=60, json={
        "title": f"TEST_TTS_{language}",
        "video_type": "ad",
        "language": language,
        "duration_sec": 15,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert "_id" not in data
    assert data["language"] == language
    created_projects.append(data["project_id"])
    return data["project_id"]


# ---------- Module-level import sanity ----------
class TestAiServicesModule:
    def test_import_and_iso_mapping(self):
        sys.path.insert(0, "/app/backend")
        import ai_services
        f = ai_services.project_language_to_iso
        assert f("hindi") == "hi"
        assert f("hinglish") == "hi"
        assert f("Hindi") == "hi"
        assert f("english") == "en"
        assert f("indian_english") == "en"
        assert f(None) is None
        assert f("") is None
        assert f("french") is None

    def test_synthesize_speech_signature(self):
        sys.path.insert(0, "/app/backend")
        import ai_services
        params = inspect.signature(ai_services.synthesize_speech).parameters
        assert "language_code" in params
        assert params["language_code"].default is None


# ---------- Catalog regression ----------
class TestVoiceCatalog:
    def test_voices_catalog(self, session):
        r = session.get(f"{API}/catalog/voices", timeout=60)
        assert r.status_code == 200, r.text
        voices = r.json()
        assert isinstance(voices, list)
        assert len(voices) == 22, f"expected 22 voices, got {len(voices)}"
        langs = {}
        for v in voices:
            assert {"id", "name", "language"} <= set(v.keys()), v
            langs[v["language"]] = langs.get(v["language"], 0) + 1
        assert langs.get("hindi") == 6, langs
        assert langs.get("hinglish") == 6, langs
        assert langs.get("english") == 10, langs

    @pytest.fixture(scope="class")
    def a_voice(self, session):
        voices = session.get(f"{API}/catalog/voices", timeout=60).json()
        return voices[0]["id"]


# ---------- TTS generation ----------
class TestTTS:
    @pytest.fixture(scope="class")
    def voices(self, session):
        return session.get(f"{API}/catalog/voices", timeout=60).json()

    def _voice_for(self, voices, lang):
        for v in voices:
            if v["language"] == lang:
                return v["id"]
        return voices[0]["id"]

    def _run_tts(self, session, headers, voices, lang, text):
        pid = _make_project(session, headers, lang)
        vid = self._voice_for(voices, lang if lang != "english" else "english")
        r = session.post(f"{API}/ai/tts", headers=headers, timeout=180, json={
            "text": text, "voice_id": vid, "project_id": pid,
        })
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        data = r.json()
        print(f"[{lang}] provider={data.get('provider')} err={data.get('error')} "
              f"len={len(data.get('audio_url') or '')}")
        assert data.get("audio_url"), f"No audio for {lang}: {data}"
        assert data.get("provider") in ("elevenlabs", "openai")
        assert isinstance(data.get("credits_left"), int)
        # verify persistence flags on the project
        pr = session.get(f"{API}/projects/{pid}", headers=headers, timeout=60)
        assert pr.status_code == 200, pr.text
        proj = pr.json()
        assert "_id" not in proj
        assert proj.get("voice_stale") is False
        return data, pid, proj

    def test_tts_hindi_devanagari(self, session, headers, voices):
        self._run_tts(session, headers, voices, "hindi",
                      "नमस्ते दोस्तों! आज हम एक नई कहानी शुरू कर रहे हैं।")

    def test_tts_hinglish_roman(self, session, headers, voices):
        self._run_tts(session, headers, voices, "hinglish",
                      "Yaar 3AM ho gaya aur pet phir se khali hai. Chalo kuch order karein!")

    def test_tts_english_regression(self, session, headers, voices):
        self._run_tts(session, headers, voices, "english",
                      "Hello everyone, welcome back to another quick product story.")

    def test_tts_without_project_id(self, session, headers, voices):
        vid = self._voice_for(voices, "hindi")
        r = session.post(f"{API}/ai/tts", headers=headers, timeout=180, json={
            "text": "Bilkul sahi, chaliye shuru karein.", "voice_id": vid,
        })
        assert r.status_code == 200, r.text
        assert r.json().get("audio_url"), r.json()

    def test_tts_requires_auth(self, session, voices):
        r = session.post(f"{API}/ai/tts", timeout=60, json={
            "text": "hi", "voice_id": voices[0]["id"]})
        assert r.status_code in (401, 403), r.status_code


# ---------- Preview + cache ----------
class TestTTSPreview:
    @pytest.fixture(scope="class")
    def hindi_voice(self, session):
        voices = session.get(f"{API}/catalog/voices", timeout=60).json()
        return next(v["id"] for v in voices if v["language"] == "hindi")

    def test_preview_hindi_and_cache(self, session, headers, hindi_voice):
        payload = {"voice_id": hindi_voice, "language": "hindi"}
        r1 = session.post(f"{API}/ai/tts/preview", headers=headers, timeout=180, json=payload)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        print(f"preview1: cached={d1.get('cached')} provider={d1.get('provider')} err={d1.get('error')}")
        assert d1.get("audio_url"), d1
        r2 = session.post(f"{API}/ai/tts/preview", headers=headers, timeout=180, json=payload)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2.get("cached") is True, d2
        assert d2["audio_url"] == d1["audio_url"]

    def test_preview_hinglish(self, session, headers, hindi_voice):
        r = session.post(f"{API}/ai/tts/preview", headers=headers, timeout=180,
                         json={"voice_id": hindi_voice, "language": "hinglish"})
        assert r.status_code == 200, r.text
        assert r.json().get("audio_url"), r.json()
