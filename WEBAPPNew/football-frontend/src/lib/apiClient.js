import { API_BASE_URL } from '../config/apiBase.js';

/** Shared JSON transport. Auth headers and AbortSignals pass through unchanged. */
export async function fetchJson(path, options) {
  const url = /^https?:\/\//.test(path) ? path : `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
