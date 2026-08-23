import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  // Per-tab token — see AuthContext for rationale on sessionStorage.
  // Fall back to localStorage only for the one-shot migration case where
  // an older version of the app wrote the token there.
  const t = sessionStorage.getItem("cs2_token") || localStorage.getItem("cs2_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export default api;
