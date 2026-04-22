import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../config/apiBase";

const UserContext = createContext(null);

const AUTH_TOKEN_KEY = "fpl_auth_token_v1";
const AUTH_PROVIDER_KEY = "fpl_auth_provider_v1";
const GUEST_DEVICE_KEY = "fpl_guest_device_id_v1";
const GUEST_RECENTS_KEY = "fpl_guest_recent_team_ids_v1";
const LOCAL_GUEST_TOKEN_PREFIX = "local-guest.";

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeTeamIds(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => Math.trunc(v));
}

function upsertRecentTeamIds(prev, teamId, limit = 30) {
  const n = Number(teamId);
  if (!Number.isFinite(n) || n <= 0) return Array.isArray(prev) ? prev : [];
  const sid = Math.trunc(n);
  const arr = normalizeTeamIds(prev);
  const without = arr.filter((x) => x !== sid);
  return [sid, ...without].slice(0, limit);
}

export function UserDataProvider({ children }) {
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) || "");
  const [provider, setProvider] = useState(() => localStorage.getItem(AUTH_PROVIDER_KEY) || "");
  const [user, setUser] = useState(null);
  const [recentTeamIds, setRecentTeamIds] = useState(() =>
    normalizeTeamIds(safeParse(localStorage.getItem(GUEST_RECENTS_KEY), []))
  );
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const hasSession = Boolean(token);
  const isGoogleUser = provider === "google";
  const isGuestUser = provider === "guest";

  const setSession = ({ nextToken, nextProvider, nextUser, nextRecentTeamIds }) => {
    const t = nextToken || "";
    const p = nextProvider || "";
    setToken(t);
    setProvider(p);
    setUser(nextUser || null);
    setRecentTeamIds(normalizeTeamIds(nextRecentTeamIds || []));
    if (t) localStorage.setItem(AUTH_TOKEN_KEY, t);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
    if (p) localStorage.setItem(AUTH_PROVIDER_KEY, p);
    else localStorage.removeItem(AUTH_PROVIDER_KEY);
  };

  const clearSession = () => {
    setToken("");
    setProvider("");
    setUser(null);
    setRecentTeamIds([]);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_PROVIDER_KEY);
  };

  const isLocalGuestToken =
    provider === "guest" && typeof token === "string" && token.startsWith(LOCAL_GUEST_TOKEN_PREFIX);
  const authHeaders = token && !isLocalGuestToken ? { Authorization: `Bearer ${token}` } : {};

  const loginAsGuest = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      let guestDeviceId = localStorage.getItem(GUEST_DEVICE_KEY);
      if (!guestDeviceId) {
        guestDeviceId = `guest-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
        localStorage.setItem(GUEST_DEVICE_KEY, guestDeviceId);
      }

      let payload = null;
      try {
        const res = await fetch(`${API_BASE_URL}/auth/guest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: guestDeviceId }),
        });
        if (!res.ok) throw new Error(await res.text());
        payload = await res.json();
      } catch {
        // Fallback: allow guest usage even if auth endpoint is not available yet.
        payload = {
          token: `${LOCAL_GUEST_TOKEN_PREFIX}${Date.now().toString(36)}`,
          provider: "guest",
          user: { id: guestDeviceId, name: "Guest", email: null, avatar_url: null },
          recent_team_ids: [],
        };
      }

      const guestRecents = normalizeTeamIds(
        safeParse(localStorage.getItem(GUEST_RECENTS_KEY), payload?.recent_team_ids || [])
      );
      setSession({
        nextToken: payload?.token,
        nextProvider: payload?.provider || "guest",
        nextUser: payload?.user || { id: guestDeviceId, name: "Guest" },
        nextRecentTeamIds: guestRecents,
      });
      return true;
    } catch (e) {
      setAuthError(e?.message || "Guest login failed.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  };

  const loginWithGoogleCredential = async (credential) => {
    if (!credential) {
      setAuthError("Google credential missing.");
      return false;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const res = await fetch(`${API_BASE_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      setSession({
        nextToken: payload?.token,
        nextProvider: payload?.provider || "google",
        nextUser: payload?.user || null,
        nextRecentTeamIds: payload?.recent_team_ids || [],
      });
      return true;
    } catch (e) {
      setAuthError(e?.message || "Google login failed.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  };

  const refreshProfile = async () => {
    if (!token) return false;
    if (isLocalGuestToken) {
      const recent = normalizeTeamIds(safeParse(localStorage.getItem(GUEST_RECENTS_KEY), []));
      setProvider("guest");
      setUser({ id: localStorage.getItem(GUEST_DEVICE_KEY) || "guest", name: "Guest", email: null, avatar_url: null });
      setRecentTeamIds(recent);
      return true;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { ...authHeaders },
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      const nextProvider = payload?.provider || provider || "";
      const localGuestRecents = normalizeTeamIds(
        safeParse(localStorage.getItem(GUEST_RECENTS_KEY), [])
      );
      const recent =
        nextProvider === "guest"
          ? localGuestRecents
          : normalizeTeamIds(payload?.recent_team_ids || []);

      setProvider(nextProvider);
      setUser(payload?.user || null);
      setRecentTeamIds(recent);
      if (nextProvider === "guest") {
        localStorage.setItem(GUEST_RECENTS_KEY, JSON.stringify(recent));
      }
      return true;
    } catch {
      clearSession();
      return false;
    }
  };

  const logout = () => {
    clearSession();
    setAuthError("");
  };

  const recordRecentTeamId = async (teamId) => {
    const id = Number(teamId);
    if (!Number.isFinite(id) || id <= 0) return;
    const normalized = Math.trunc(id);

    if (provider === "google" && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/user/recent-team-id`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({ team_id: normalized }),
        });
        if (!res.ok) throw new Error(await res.text());
        const payload = await res.json();
        setRecentTeamIds(normalizeTeamIds(payload?.recent_team_ids || []));
        return;
      } catch (e) {
        console.warn("Failed to persist recent team id:", e);
      }
    }

    // Guest/local fallback
    setRecentTeamIds((prev) => {
      const next = upsertRecentTeamIds(prev, normalized, 30);
      localStorage.setItem(GUEST_RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) setAuthReady(true);
        return;
      }
      if (provider === "guest" && token.startsWith(LOCAL_GUEST_TOKEN_PREFIX)) {
        if (!cancelled) {
          const recent = normalizeTeamIds(safeParse(localStorage.getItem(GUEST_RECENTS_KEY), []));
          setUser({
            id: localStorage.getItem(GUEST_DEVICE_KEY) || "guest",
            name: "Guest",
            email: null,
            avatar_url: null,
          });
          setRecentTeamIds(recent);
          setAuthReady(true);
        }
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const payload = await res.json();
        if (cancelled) return;
        const nextProvider = payload?.provider || provider || "";
        const localGuestRecents = normalizeTeamIds(
          safeParse(localStorage.getItem(GUEST_RECENTS_KEY), [])
        );
        const nextRecent =
          nextProvider === "guest"
            ? localGuestRecents
            : normalizeTeamIds(payload?.recent_team_ids || []);
        setProvider(nextProvider);
        setUser(payload?.user || null);
        setRecentTeamIds(nextRecent);
        if (nextProvider === "guest") {
          localStorage.setItem(GUEST_RECENTS_KEY, JSON.stringify(nextRecent));
        }
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({
      authReady,
      authBusy,
      authError,
      hasSession,
      isGoogleUser,
      isGuestUser,
      provider,
      user,
      recentTeamIds,
      token,
      authHeaders,
      loginAsGuest,
      loginWithGoogleCredential,
      refreshProfile,
      logout,
      recordRecentTeamId,
    }),
    [
      authReady,
      authBusy,
      authError,
      hasSession,
      isGoogleUser,
      isGuestUser,
      provider,
      user,
      recentTeamIds,
      token,
    ]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export const useUserData = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUserData must be used inside UserDataProvider");
  return ctx;
};
