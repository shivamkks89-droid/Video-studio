// Offline-first draft storage using IndexedDB (idb-keyval).
// Keeps scripts / voice picks / project title alive when the network is dead
// and auto-syncs to the backend once connectivity returns.

import { get, set, del, keys } from "idb-keyval";
import { api } from "./api";

const DRAFT_PREFIX = "cinereel.draft.";
const PENDING_KEY  = "cinereel.pending-sync";

/** Persist a draft locally. `id` is either the server project_id or a
 *  temporary `local-<uuid>` id used until the first successful sync. */
export async function saveDraft(id, patch) {
  const key = DRAFT_PREFIX + id;
  const existing = (await get(key)) || {};
  const merged = { ...existing, ...patch, id, updated_at: Date.now() };
  await set(key, merged);
  return merged;
}

export async function loadDraft(id) {
  return (await get(DRAFT_PREFIX + id)) || null;
}

export async function deleteDraft(id) {
  await del(DRAFT_PREFIX + id);
}

export async function listDrafts() {
  const ks = await keys();
  const draftKeys = ks.filter((k) => typeof k === "string" && k.startsWith(DRAFT_PREFIX));
  const out = [];
  for (const k of draftKeys) out.push(await get(k));
  out.sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0));
  return out;
}

/** Queue a draft for the next sync-when-online cycle. */
export async function queueForSync(id) {
  const q = (await get(PENDING_KEY)) || [];
  if (!q.includes(id)) q.push(id);
  await set(PENDING_KEY, q);
}

/** Attempt to push every queued draft to the backend. Silent on failure. */
export async function syncPending() {
  if (!navigator.onLine) return { synced: 0, failed: 0 };
  const q = (await get(PENDING_KEY)) || [];
  let synced = 0, failed = 0;
  const remaining = [];
  for (const id of q) {
    const d = await loadDraft(id);
    if (!d) continue;
    // Skip empty drafts — no reason to burn a server project id on nothing.
    const hasContent = (d.script?.body || d.script?.hook || d.title) && (d.script?.body || "").trim();
    if (!hasContent) {
      await deleteDraft(id);
      continue;
    }
    try {
      if (id.startsWith("local-")) {
        // Server-side "create project + script + scenes" happens atomically here.
        const { data } = await api.post("/projects/from-script", {
          title: d.title || (d.script?.body || "").split(/\s+/).slice(0, 8).join(" ") || "Offline draft",
          video_type: d.video_type || "cinematic_ad",
          language: d.language || "hinglish",
          aspect_ratio: d.aspect_ratio || "9:16",
          duration_sec: 30,
          script: {
            hook: d.script?.hook || "",
            body: d.script?.body || "",
            cta: d.script?.cta || "",
            voiceover_script: d.script?.body || "",
            scenes: [], captions: [], music_mood: "cinematic",
          },
        });
        // Optional: attach chosen voice.
        if (d.voice_id && data.project_id) {
          await api.put(`/projects/${data.project_id}`, { voice_id: d.voice_id }).catch(() => {});
        }
        await deleteDraft(id);
        localStorage.removeItem("cinereel.active-draft-id");
        synced++;
      } else {
        await api.put(`/projects/${id}`, {
          voice_id: d.voice_id, title: d.title,
        });
        await deleteDraft(id);
        synced++;
      }
    } catch {
      failed++;
      remaining.push(id);
    }
  }
  await set(PENDING_KEY, remaining);
  return { synced, failed };
}

export function newLocalDraftId() {
  const rnd = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 10);
  return `local-${rnd}`;
}
