// Make /api/files/... URLs absolute against REACT_APP_BACKEND_URL.
const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

export function assetUrl(u) {
  if (!u) return u;
  if (u.startsWith("/api/")) return `${BACKEND}${u}`;
  return u;
}
