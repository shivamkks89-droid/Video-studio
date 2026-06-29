"""End-to-end backend tests for CineReel AI."""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://video-studio-ai-38.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# ----------- Fixtures -----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def new_user(session):
    """Creates a unique user via signup, returns dict {email,password,token,user}."""
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    password = "Test1234!"
    r = session.post(f"{API}/auth/signup", json={"email": email, "password": password, "name": "Test User"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "password": password, "token": data["token"], "user": data["user"]}


@pytest.fixture(scope="session")
def auth_headers(new_user):
    return {"Authorization": f"Bearer {new_user['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_headers(session):
    r = session.post(f"{API}/auth/login", json={"email": "admin@cinereel.ai", "password": "admin12345"})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ----------- Health -----------
def test_root_ok(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ----------- Catalog -----------
@pytest.mark.parametrize("path", [
    "/catalog/video-types", "/catalog/templates", "/catalog/voices",
    "/catalog/avatars", "/catalog/plans",
])
def test_catalogs_non_empty(session, path):
    r = session.get(f"{API}{path}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) > 0, f"Empty catalog at {path}"


def test_catalog_assets(session):
    """/catalog/assets returns a dict of images/music/icons/stickers."""
    r = session.get(f"{API}/catalog/assets")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, (dict, list))
    if isinstance(data, dict):
        assert any(data.get(k) for k in ("images", "music", "icons", "stickers"))
    else:
        assert len(data) > 0


# ----------- Auth -----------
def test_signup_duplicate(session, new_user):
    r = session.post(f"{API}/auth/signup", json={"email": new_user["email"], "password": "Whatever1!", "name": "x"})
    assert r.status_code == 400


def test_login_success(session, new_user):
    r = session.post(f"{API}/auth/login", json={"email": new_user["email"], "password": new_user["password"]})
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_wrong_password(session, new_user):
    r = session.post(f"{API}/auth/login", json={"email": new_user["email"], "password": "WrongPass!!"})
    assert r.status_code == 401


def test_otp_flow(session):
    email = f"otp_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(f"{API}/auth/otp/request", json={"email": email})
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "dev_code" in payload, f"dev_code missing in dev: {payload}"
    code = payload["dev_code"]
    r2 = session.post(f"{API}/auth/otp/verify", json={"email": email, "code": code})
    assert r2.status_code == 200, r2.text
    assert "token" in r2.json() and "user" in r2.json()


def test_me_with_auth(session, auth_headers, new_user):
    r = session.get(f"{API}/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["email"] == new_user["email"]


def test_me_without_auth(session):
    r = session.get(f"{API}/auth/me")
    assert r.status_code == 401


# ----------- Admin -----------
def test_admin_users(session, admin_headers):
    r = session.get(f"{API}/admin/users", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert any(u.get("email") == "admin@cinereel.ai" for u in data)


def test_admin_analytics(session, admin_headers):
    r = session.get(f"{API}/admin/analytics", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    for k in ("users", "projects", "transactions", "revenue_usd", "plans"):
        assert k in data


def test_admin_forbidden_for_regular(session, auth_headers):
    r = session.get(f"{API}/admin/users", headers=auth_headers)
    assert r.status_code == 403
    r2 = session.get(f"{API}/admin/analytics", headers=auth_headers)
    assert r2.status_code == 403


# ----------- AI -----------
def test_ai_script(session, auth_headers, new_user):
    me = session.get(f"{API}/auth/me", headers=auth_headers).json()
    before = me["credits"]
    body = {"topic": "Launch new AI fitness app", "language": "english", "video_type": "ad", "duration_seconds": 30}
    r = session.post(f"{API}/ai/script", headers=auth_headers, json=body, timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    script = data["script"]
    for key in ("hook", "body", "cta", "scenes"):
        assert key in script, f"missing {key} in script"
    assert data["credits_left"] == before - 5


def test_ai_hooks(session, auth_headers):
    r = session.post(f"{API}/ai/hooks", headers=auth_headers,
                     json={"topic": "yoga app", "language": "english", "count": 3}, timeout=60)
    assert r.status_code == 200, r.text
    assert isinstance(r.json()["hooks"], list) and len(r.json()["hooks"]) >= 1


def test_ai_ctas(session, auth_headers):
    r = session.post(f"{API}/ai/ctas", headers=auth_headers,
                     json={"topic": "yoga app", "language": "english", "count": 3}, timeout=60)
    assert r.status_code == 200, r.text
    assert isinstance(r.json()["ctas"], list) and len(r.json()["ctas"]) >= 1


def test_ai_ad_ideas(session, auth_headers):
    r = session.post(f"{API}/ai/ad-ideas", headers=auth_headers,
                     json={"query": "fitness app for busy moms", "language": "english"}, timeout=90)
    assert r.status_code == 200, r.text
    ideas = r.json()["ideas"]
    assert isinstance(ideas, list) and len(ideas) > 0
    item = ideas[0]
    for k in ("title", "angle", "hook", "video_type"):
        assert k in item, f"idea missing {k}"


def test_ai_tts(session, auth_headers):
    # fetch a valid voice id
    voices = session.get(f"{API}/catalog/voices").json()
    assert voices, "no voices"
    voice_id = voices[0].get("voice_id") or voices[0].get("id")
    assert voice_id, f"no voice id in {voices[0]}"
    # Capture credits before
    me_before = session.get(f"{API}/auth/me", headers=auth_headers).json()
    cb = me_before["credits"]
    r = session.post(f"{API}/ai/tts", headers=auth_headers,
                     json={"text": "Hello, this is a short test.", "voice_id": voice_id}, timeout=120)
    # Either success (200 with data URI) or graceful failure (502 with friendly message + credit refund)
    assert r.status_code in (200, 502), r.text
    if r.status_code == 200:
        url = r.json().get("audio_url")
        assert isinstance(url, str) and url.startswith("data:")
    else:
        # 502 path: credits must be refunded (no net charge)
        me_after = session.get(f"{API}/auth/me", headers=auth_headers).json()
        assert me_after["credits"] == cb, f"credits not refunded on TTS failure: before={cb} after={me_after['credits']}"


def test_ai_scene_image(session, auth_headers):
    r = session.post(f"{API}/ai/scene-image", headers=auth_headers,
                     json={"prompt": "futuristic city skyline at sunset, cinematic", "aspect_ratio": "16:9"},
                     timeout=120)
    # should not 500 — either data uri or warning
    assert r.status_code == 200, r.text
    data = r.json()
    assert "image_url" in data
    if data["image_url"] is None:
        assert "warning" in data
    else:
        assert data["image_url"].startswith("data:")


# ----------- Projects -----------
@pytest.fixture(scope="session")
def project(session, auth_headers):
    body = {
        "title": "TEST_proj",
        "video_type": "ad",
        "language": "english",
        "aspect_ratio": "9:16",
        "resolution": "1080p",
        "fps": 30,
        "duration_seconds": 30,
    }
    r = session.post(f"{API}/projects", headers=auth_headers, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_project_create_and_get(session, auth_headers, project):
    pid = project["project_id"]
    r = session.get(f"{API}/projects/{pid}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["title"] == "TEST_proj"


def test_project_list(session, auth_headers, project):
    r = session.get(f"{API}/projects", headers=auth_headers)
    assert r.status_code == 200
    assert any(p["project_id"] == project["project_id"] for p in r.json())


def test_project_update(session, auth_headers, project):
    pid = project["project_id"]
    r = session.put(f"{API}/projects/{pid}", headers=auth_headers, json={"title": "TEST_updated"})
    assert r.status_code == 200
    r2 = session.get(f"{API}/projects/{pid}", headers=auth_headers)
    assert r2.json()["title"] == "TEST_updated"


def test_project_duplicate(session, auth_headers, project):
    pid = project["project_id"]
    r = session.post(f"{API}/projects/{pid}/duplicate", headers=auth_headers)
    assert r.status_code == 200
    new_id = r.json()["project_id"]
    assert new_id != pid
    # cleanup
    session.delete(f"{API}/projects/{new_id}", headers=auth_headers)


def test_project_delete(session, auth_headers):
    # create then delete
    r = session.post(f"{API}/projects", headers=auth_headers,
                     json={"title": "TEST_to_delete", "video_type": "ad", "language": "english",
                           "aspect_ratio": "9:16", "resolution": "1080p", "fps": 30, "duration_seconds": 15})
    pid = r.json()["project_id"]
    rd = session.delete(f"{API}/projects/{pid}", headers=auth_headers)
    assert rd.status_code == 200
    rg = session.get(f"{API}/projects/{pid}", headers=auth_headers)
    assert rg.status_code == 404


# ----------- Brand Kits -----------
def test_brand_kit_crud(session, auth_headers):
    body = {"name": "TEST_kit", "logo_url": "https://x.com/a.png", "primary_color": "#ff0000"}
    r = session.post(f"{API}/brand-kits", headers=auth_headers, json=body)
    assert r.status_code == 200, r.text
    kit_id = r.json()["kit_id"]
    r2 = session.get(f"{API}/brand-kits", headers=auth_headers)
    assert any(k["kit_id"] == kit_id for k in r2.json())
    rd = session.delete(f"{API}/brand-kits/{kit_id}", headers=auth_headers)
    assert rd.status_code == 200


# ----------- Credits / Billing -----------
def test_credits_history(session, auth_headers):
    r = session.get(f"{API}/credits/history", headers=auth_headers)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    # by now there should be some deductions from prior AI tests
    assert len(items) > 0


def test_billing_purchase_creator(session, auth_headers):
    me_before = session.get(f"{API}/auth/me", headers=auth_headers).json()
    before = me_before["credits"]
    r = session.post(f"{API}/billing/purchase", headers=auth_headers, json={"plan": "creator"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["plan"] == "creator"
    assert data["credits"] == before + 1500
    me_after = session.get(f"{API}/auth/me", headers=auth_headers).json()
    assert me_after["plan"] == "creator"


# ----------- Insufficient Credits -----------
def test_insufficient_credits(session):
    """Create a fresh user, drain credits via admin or repeated calls — then expect 402."""
    # easier: create new user, login as admin and zero out their credits via admin update
    email = f"poor_{uuid.uuid4().hex[:8]}@example.com"
    password = "Test1234!"
    r = session.post(f"{API}/auth/signup", json={"email": email, "password": password, "name": "Poor"})
    assert r.status_code == 200
    poor_token = r.json()["token"]
    poor_uid = r.json()["user"]["user_id"]

    # admin login
    ar = session.post(f"{API}/auth/login", json={"email": "admin@cinereel.ai", "password": "admin12345"})
    admin_token = ar.json()["token"]
    upd = session.put(f"{API}/admin/users/{poor_uid}",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json={"credits": 0})
    assert upd.status_code == 200, upd.text

    r3 = session.post(f"{API}/ai/script",
                      headers={"Authorization": f"Bearer {poor_token}"},
                      json={"topic": "test", "language": "english", "video_type": "ad", "duration_seconds": 15},
                      timeout=60)
    assert r3.status_code == 402, f"Expected 402 got {r3.status_code}: {r3.text}"
