import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

const deviceId = () => {
  let d = localStorage.getItem("cinereel_device");
  if (!d) { d = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).slice(0, 64); localStorage.setItem("cinereel_device", d); }
  return d;
};

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("cinereel_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  cfg.headers["X-Device-Id"] = deviceId();
  return cfg;
});
