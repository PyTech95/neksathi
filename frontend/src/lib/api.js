import axios from "axios";

// Set REACT_APP_BACKEND_URL to an origin, e.g. http://127.0.0.1:8000.
// Empty uses the same origin; trim trailing slashes and avoid duplicate /api.
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").trim().replace(/\/+$/, "");
export const API = BACKEND_URL.endsWith("/api") ? BACKEND_URL : `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("nk_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
