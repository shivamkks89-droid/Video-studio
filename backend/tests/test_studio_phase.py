"""Phase 1-6 Studio endpoint tests: estimate, refine, multi-creative, ad-copy,
campaign, creative-score, compliance, stt, voice upload, music catalog,
workspaces, versions, resize, campaign-pack."""
import io
import os
import zipfile

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

EMAIL = "admin@cinereel.ai"
PASSWORD = "admin12345"

LONG_TIMEOUT = 180


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code} {r.text[:300]}")
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def project(client):
    r = client.post(f"{BASE}/projects", json={
        "title": "TEST_studio_project", "video_type": "cinematic_ad",
        "language": "english", "aspect_ratio": "9:16", "duration_sec": 30,
    }, timeout=60)
    assert r.status_code in (200, 201), r.text[:300]
    pid = r.json()["project_id"]
    yield pid
    client.delete(f"{BASE}/projects/{pid}", timeout=60)


# ---------- MUSIC CATALOG ----------
class TestMusicCatalog:
    def test_catalog_music(self, client):
        r = requests.get(f"{BASE}/catalog/music", timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert len(d["music"]) == 10
        assert len(d["sfx"]) == 7
        for t in d["music"]:
            assert t["url"].startswith("http")
            assert t["mood"] and isinstance(t["bpm"], int)

    def test_music_urls_are_playable(self, client):
        """Catalog URLs must be fetchable by a browser (<audio src>) — pixabay CDN
        currently rejects hotlinking with 403 for most tracks."""
        d = requests.get(f"{BASE}/catalog/music", timeout=60).json()
        broken = []
        for item in d["music"] + d["sfx"]:
            try:
                resp = requests.get(item["url"], timeout=25, stream=True,
                                    headers={"User-Agent": "Mozilla/5.0"})
                code = resp.status_code
                resp.close()
            except Exception as exc:  # noqa: BLE001
                code = str(exc)[:40]
            if code != 200:
                broken.append((item["id"], code))
        assert not broken, f"unplayable catalog audio: {broken}"

    def test_set_project_music(self, client, project):
        r = client.post(f"{BASE}/projects/music", json={
            "project_id": project, "music_id": "mx-lofi-01", "music_volume": 0.35})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["ok"] is True
        assert d["music_url"].startswith("http")
        assert abs(d["music_volume"] - 0.35) < 1e-6
        g = client.get(f"{BASE}/projects/{project}", timeout=60).json()
        assert g.get("music_id") == "mx-lofi-01"
        assert g.get("music_url", "").startswith("http")


# ---------- CREDIT ESTIMATE ----------
class TestEstimate:
    @pytest.mark.parametrize("action,expected", [
        ("script", 5), ("variants", 15), ("tts", 2), ("scene_image", 3),
        ("storyboard", 18), ("render", 10), ("multi_creative", 6), ("ad_copy", 4),
        ("campaign", 8), ("stt", 4), ("refine", 2), ("resize", 8),
    ])
    def test_estimate_actions(self, client, action, expected):
        r = client.post(f"{BASE}/ai/estimate", json={"action": action, "count": 1})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["estimate"] == expected
        assert d["breakdown"][0]["unit"] == expected
        assert isinstance(d["credits_left"], int)
        assert d["can_afford"] is (d["credits_left"] >= d["estimate"])

    def test_estimate_count_multiplier(self, client):
        d = client.post(f"{BASE}/ai/estimate", json={"action": "scene_image", "count": 6}).json()
        assert d["estimate"] == 18
        assert d["breakdown"][0]["count"] == 6

    def test_estimate_requires_auth(self):
        r = requests.post(f"{BASE}/ai/estimate", json={"action": "script"}, timeout=60)
        assert r.status_code in (401, 403)


# ---------- SCRIPT REFINE ----------
SAMPLE = ("Our new protein shake helps you build muscle fast. It has 30g protein "
          "per serving and tastes like chocolate. Order today and save 20 percent.")


class TestScriptRefine:
    @pytest.mark.parametrize("action", ["improve", "shorten", "expand", "split_scenes"])
    def test_refine_actions(self, client, action):
        r = client.post(f"{BASE}/ai/script/refine", json={
            "script_text": SAMPLE, "action": action, "language": "english"},
            timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert isinstance(d["text"], str) and len(d["text"]) > 20
        assert d["word_count"] == len(d["text"].split())
        assert d["estimated_duration_sec"] >= 5
        assert isinstance(d["credits_left"], int)

    def test_refine_change_tone(self, client):
        r = client.post(f"{BASE}/ai/script/refine", json={
            "script_text": SAMPLE, "action": "change_tone", "tone": "funny"},
            timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        assert len(r.json()["text"]) > 20

    def test_refine_translate_hindi(self, client):
        r = client.post(f"{BASE}/ai/script/refine", json={
            "script_text": SAMPLE, "action": "translate", "target_language": "hindi"},
            timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        out = r.json()["text"]
        assert any("\u0900" <= ch <= "\u097F" for ch in out), f"no devanagari: {out[:200]}"

    def test_refine_empty_script_400(self, client):
        r = client.post(f"{BASE}/ai/script/refine", json={"script_text": "   ", "action": "improve"})
        assert r.status_code == 400

    def test_refine_deducts_credits(self, client):
        before = client.get(f"{BASE}/auth/me", timeout=60).json()["credits"]
        r = client.post(f"{BASE}/ai/script/refine", json={
            "script_text": SAMPLE, "action": "shorten"}, timeout=LONG_TIMEOUT)
        assert r.status_code == 200
        assert r.json()["credits_left"] == before - 2


# ---------- MULTI CREATIVE ----------
class TestMultiCreative:
    @pytest.mark.parametrize("count", [1, 3])
    def test_multi_creative_counts(self, client, count):
        r = client.post(f"{BASE}/ai/multi-creative", json={
            "topic": "TEST_ protein shake launch", "count": count, "tone": "energetic"},
            timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        variants = r.json()["variants"]
        assert len(variants) == count, f"asked {count} got {len(variants)}"
        hooks = set()
        for v in variants:
            for k in ("angle", "hook", "body", "cta", "opening_visual"):
                assert v.get(k), f"missing {k} in {v}"
            hooks.add(v["hook"].strip().lower())
        assert len(hooks) == count, "variants not distinct"

    def test_multi_creative_five_distinct(self, client):
        r = client.post(f"{BASE}/ai/multi-creative", json={
            "topic": "TEST_ ayurvedic hair oil", "count": 5, "language": "hinglish"},
            timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        v = r.json()["variants"]
        assert len(v) == 5
        assert len({x["hook"].strip().lower() for x in v}) == 5

    def test_multi_creative_invalid_count_422(self, client):
        r = client.post(f"{BASE}/ai/multi-creative", json={"topic": "x", "count": 7})
        assert r.status_code == 422


# ---------- AD COPY ----------
class TestAdCopy:
    def test_ad_copy_all_platforms(self, client):
        plats = ["meta", "google", "youtube", "tiktok", "linkedin", "snapchat", "x", "pinterest"]
        r = client.post(f"{BASE}/ai/ad-copy", json={
            "topic": "TEST_ smart fitness band", "platforms": plats,
            "language": "english", "tone": "professional", "length": "short"},
            timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        out = r.json()["platforms"]
        missing = [p for p in plats if p not in out or not out[p]]
        assert not missing, f"missing platform copy: {missing}; got {list(out)}"


# ---------- CAMPAIGN ----------
class TestCampaign:
    def test_campaign_per_platform(self, client, project):
        plats = ["instagram_reel", "youtube_ad", "linkedin_ad", "tiktok"]
        r = client.post(f"{BASE}/ai/campaign", json={
            "topic": "TEST_ organic coffee brand", "platforms": plats,
            "project_id": project}, timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        camp = r.json()["campaign"]
        assert isinstance(camp, list) and len(camp) == len(plats), camp
        got = {c.get("platform") for c in camp}
        assert got == set(plats), f"platform mismatch {got}"
        for c in camp:
            for k in ("aspect_ratio", "duration_sec", "hook", "script", "cta",
                      "on_screen_text", "caption"):
                assert c.get(k) not in (None, "", []), f"{c.get('platform')} missing {k}"
        # persisted on project
        g = client.get(f"{BASE}/projects/{project}", timeout=60).json()
        assert g.get("campaign") and len(g["campaign"]) == len(plats)


# ---------- CREATIVE SCORE ----------
class TestCreativeScore:
    def test_score_structure(self, client):
        r = client.post(f"{BASE}/ai/creative-score", json={
            "hook": "Stop wasting money on gym memberships",
            "body": "Our 15 minute home workout burns the same calories.",
            "cta": "Download free plan", "platform": "meta"}, timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert 0 <= d["overall"] <= 100
        for k in ("hook", "message", "visual", "cta", "platform_fit"):
            assert k in d["scores"], d["scores"]
            assert "value" in d["scores"][k] and "note" in d["scores"][k]
        assert isinstance(d["suggestions"], list) and len(d["suggestions"]) > 0


# ---------- COMPLIANCE ----------
class TestCompliance:
    def test_compliance_flags_risky(self, client):
        r = client.post(f"{BASE}/ai/compliance", json={
            "text": "Guaranteed results in 3 days! Cures diabetes 100%. "
                    "Doctors hate this miracle pill. Earn 5 lakh per month risk free.",
            "platform": "meta"}, timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d.get("risk_level") in ("low", "medium", "high"), d
        assert d["risk_level"] == "high", f"expected high risk, got {d.get('risk_level')}"
        assert d.get("flags"), d
        for f in d["flags"]:
            assert f.get("snippet") and f.get("reason") and f.get("safer"), f
        assert d.get("summary")

    def test_compliance_safe_text(self, client):
        r = client.post(f"{BASE}/ai/compliance", json={
            "text": "Our cotton t-shirts are soft, breathable and ship in 3 days.",
            "platform": "meta"}, timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        assert r.json().get("risk_level") in ("low", "medium")


# ---------- VOICE UPLOAD + STT ----------
def _make_wav(seconds=2, rate=16000):
    import math
    import struct
    import wave
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = b"".join(
            struct.pack("<h", int(12000 * math.sin(2 * math.pi * 220 * (i / rate))))
            for i in range(int(rate * seconds)))
        w.writeframes(frames)
    return buf.getvalue()


class TestVoiceUploadSTT:
    uploaded_url = None

    def test_upload_voice(self, client, project):
        wav = _make_wav()
        r = requests.post(
            f"{BASE}/media/upload-voice",
            headers={"Authorization": client.headers["Authorization"]},
            files={"file": ("TEST_voice.wav", wav, "audio/wav")},
            data={"project_id": project}, timeout=120)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d["audio_url"], d
        assert d["source"] == "upload"
        TestVoiceUploadSTT.uploaded_url = d["audio_url"]
        g = client.get(f"{BASE}/projects/{project}", timeout=60).json()
        assert g.get("audio_url") == d["audio_url"]
        assert g.get("voice_source") == "upload"

    def test_upload_rejects_non_audio(self, client):
        r = requests.post(
            f"{BASE}/media/upload-voice",
            headers={"Authorization": client.headers["Authorization"]},
            files={"file": ("TEST_x.txt", b"hello", "text/plain")}, timeout=60)
        assert r.status_code == 400, r.text[:200]

    def test_stt_from_uploaded_audio(self, client):
        url = TestVoiceUploadSTT.uploaded_url
        if not url:
            pytest.skip("upload did not run")
        r = client.post(f"{BASE}/ai/stt", json={"audio_url": url}, timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        if d.get("error"):
            pytest.fail(f"STT error: {d['error']}")
        assert "transcript" in d
        assert isinstance(d["auto_scenes"], list) and len(d["auto_scenes"]) >= 1
        for s in d["auto_scenes"]:
            assert "index" in s and "duration" in s

    def test_stt_bad_url_400(self, client):
        r = client.post(f"{BASE}/ai/stt", json={"audio_url": "/api/files/audio/does-not-exist.mp3"},
                        timeout=60)
        assert r.status_code == 400


# ---------- WORKSPACES ----------
class TestWorkspaces:
    def test_workspace_crud(self, client, project):
        r = client.post(f"{BASE}/workspaces", json={
            "name": "TEST_Acme", "client_name": "Acme Corp", "color": "#FF0055"})
        assert r.status_code == 200, r.text[:300]
        ws = r.json()
        wid = ws["workspace_id"]
        assert ws["name"] == "TEST_Acme" and ws["client_name"] == "Acme Corp"
        assert "_id" not in ws

        lst = client.get(f"{BASE}/workspaces", timeout=60)
        assert lst.status_code == 200
        assert any(w["workspace_id"] == wid for w in lst.json())

        up = client.put(f"{BASE}/workspaces/{wid}", json={"name": "TEST_Acme2"})
        assert up.status_code == 200, up.text[:300]
        assert up.json()["name"] == "TEST_Acme2"

        # assign project
        a = client.put(f"{BASE}/projects/{project}/workspace", json={"workspace_id": wid})
        assert a.status_code == 200
        g = client.get(f"{BASE}/projects/{project}", timeout=60).json()
        assert g.get("workspace_id") == wid
        # unassign
        client.put(f"{BASE}/projects/{project}/workspace", json={"workspace_id": None})
        g2 = client.get(f"{BASE}/projects/{project}", timeout=60).json()
        assert not g2.get("workspace_id")

        d = client.delete(f"{BASE}/workspaces/{wid}", timeout=60)
        assert d.status_code == 200
        assert not any(w["workspace_id"] == wid for w in client.get(f"{BASE}/workspaces").json())

    def test_project_list_exposes_workspace_id(self, client, project):
        """The Workspaces UI groups projects using GET /api/projects, so the list
        projection must include workspace_id."""
        ws = client.post(f"{BASE}/workspaces", json={"name": "TEST_ProjList"}).json()
        wid = ws["workspace_id"]
        try:
            client.put(f"{BASE}/projects/{project}/workspace", json={"workspace_id": wid})
            items = client.get(f"{BASE}/projects", timeout=60).json()
            row = next(p for p in items if p["project_id"] == project)
            assert row.get("workspace_id") == wid, (
                f"GET /api/projects omits workspace_id (keys={sorted(row)})")
        finally:
            client.put(f"{BASE}/projects/{project}/workspace", json={"workspace_id": None})
            client.delete(f"{BASE}/workspaces/{wid}", timeout=60)


# ---------- VERSION HISTORY ----------
class TestVersions:
    def test_version_snapshot_list_restore(self, client, project):
        client.put(f"{BASE}/projects/{project}", json={"script": "VERSION_ONE script text"},
                   timeout=60)
        s = client.post(f"{BASE}/projects/{project}/versions", json={"label": "TEST_v1"})
        assert s.status_code == 200, s.text[:300]
        v = s.json()
        assert v["label"] == "TEST_v1"
        assert v["snapshot"]["script"] == "VERSION_ONE script text"

        client.put(f"{BASE}/projects/{project}", json={"script": "VERSION_TWO script text"},
                   timeout=60)
        lst = client.get(f"{BASE}/projects/{project}/versions", timeout=60)
        assert lst.status_code == 200 and len(lst.json()) >= 1

        res = client.post(
            f"{BASE}/projects/{project}/versions/{v['version_id']}/restore", timeout=60)
        assert res.status_code == 200, res.text[:300]
        g = client.get(f"{BASE}/projects/{project}", timeout=60).json()
        assert g["script"] == "VERSION_ONE script text"

    def test_snapshot_unknown_project_404(self, client):
        r = client.post(f"{BASE}/projects/proj_does_not_exist/versions", json={"label": "x"})
        assert r.status_code == 404

    def test_restore_unknown_version_404(self, client, project):
        r = client.post(f"{BASE}/projects/{project}/versions/ver_nope/restore", timeout=60)
        assert r.status_code == 404


# ---------- RESIZE ----------
class TestResize:
    def test_resize_without_storyboard_400(self, client):
        r = client.post(f"{BASE}/projects", json={
            "title": "TEST_resize_empty", "video_type": "cinematic_ad",
            "language": "english", "aspect_ratio": "9:16", "duration_sec": 15}, timeout=60)
        pid = r.json()["project_id"]
        try:
            rr = client.post(f"{BASE}/projects/resize", json={
                "project_id": pid, "aspect_ratios": ["1:1"]}, timeout=120)
            assert rr.status_code == 400, rr.text[:300]
            assert "storyboard" in rr.json()["detail"].lower()
        finally:
            client.delete(f"{BASE}/projects/{pid}", timeout=60)

    def test_resize_unknown_project_404(self, client):
        r = client.post(f"{BASE}/projects/resize", json={
            "project_id": "proj_nope", "aspect_ratios": ["1:1"]}, timeout=60)
        assert r.status_code == 404


# ---------- CAMPAIGN PACK ----------
class TestCampaignPack:
    def test_campaign_pack_zip(self, client, project):
        r = client.get(f"{BASE}/projects/{project}/campaign-pack", timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type") == "application/zip"
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        assert "project.json" in names and "README.txt" in names, names
        assert z.read("project.json").decode().strip().startswith("{")

    def test_campaign_pack_404(self, client):
        r = client.get(f"{BASE}/projects/proj_nope/campaign-pack", timeout=60)
        assert r.status_code == 404


# ---------- REGRESSION: existing endpoints ----------
class TestRegression:
    def test_login_bad_password(self):
        r = requests.post(f"{BASE}/auth/login",
                          json={"email": EMAIL, "password": "wrong"}, timeout=60)
        assert r.status_code in (400, 401)

    def test_projects_list(self, client):
        r = client.get(f"{BASE}/projects", timeout=60)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_credits_history(self, client):
        r = client.get(f"{BASE}/credits/history", timeout=60)
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("transactions", [])
        assert isinstance(items, list)

    def test_ai_script(self, client):
        r = client.post(f"{BASE}/ai/script", json={
            "topic": "TEST_ eco water bottle", "language": "english",
            "video_type": "cinematic_ad", "duration_sec": 15, "tone": "professional"},
            timeout=LONG_TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        assert r.json().get("script")
