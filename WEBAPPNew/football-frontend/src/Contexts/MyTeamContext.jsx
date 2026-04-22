// src/context/DataContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { API_BASE_URL } from "../config/apiBase";
import { useUserData } from "./UserContext";

const MyTeamDataContext = createContext();
export const useMyteamData = () => useContext(MyTeamDataContext);

// LocalStorage key
const SAVED_OPT_KEY = "myteam_saved_optimizations_v1";
const OPTIMIZATION_SOLUTIONS = 3;

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Merge helper so banned players UI does NOT visually empty if a new run
 * doesn't contain the banned player rows in the returned json.
 */
function mergePlayersData(prev, next) {
  const map = new Map();

  (Array.isArray(prev) ? prev : []).forEach((p) => {
    if (p?.Name != null) map.set(p.Name.toString(), p);
  });

  (Array.isArray(next) ? next : []).forEach((p) => {
    if (p?.Name != null) map.set(p.Name.toString(), p); // overwrite with newest
  });

  return Array.from(map.values());
}

function mergeRowsBySolution(prevRows, incomingRows) {
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];
  if (!incoming.length) return Array.isArray(prevRows) ? prevRows : [];

  const solutionNo = Number(incoming[0]?.solution);
  if (!Number.isFinite(solutionNo)) {
    return incoming;
  }

  const base = Array.isArray(prevRows) ? prevRows : [];
  const filtered = base.filter((row) => Number(row?.solution || 1) !== solutionNo);
  return [...filtered, ...incoming];
}

function derivePlayersFromRows(rows, ids) {
  if (!Array.isArray(rows) || !Array.isArray(ids) || !ids.length) return [];

  return ids
    .map((sid) => {
      const key = sid?.toString();
      const p = rows.find((row) => row?.Name?.toString() === key);
      if (!p) return null;
      return { Name: p.Name, web_name: p.web_name, photo: p.photo };
    })
    .filter(Boolean);
}

export function MyTeamDataContextProvider({ children }) {
  const { authHeaders, recordRecentTeamId, guestTrackingId, hasSession } = useUserData();
  const [teamId, setTeamId] = useState("");
  const [bbRound, setBbRound] = useState("");
  const [wildRound, setWildRound] = useState("");
  const [freehitROund, setfreehitROund] = useState("");

  const [bannedList, setBannedList] = useState([]);
  const [bannedPlayersData, setBannedPlayersData] = useState([]);
  const [lockedInList, setLockedInList] = useState([]);
  const [lockedPlayersData, setLockedPlayersData] = useState([]);

  const [data, setData] = useState(null);
  const [teamData, setTeamData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);

  const [has_changed, sethas_changed] = useState(false);

  const [n_hits, setn_hits] = useState("");
  const [risk, setRisk] = useState(0);
  const [valtrans, setValtrans] = useState(0.5);
  const [optimizationProgress, setOptimizationProgress] = useState({
    expectedSolutions: OPTIMIZATION_SOLUTIONS,
    receivedSolutions: 0,
    streaming: false,
  });

  // ----------------------------
  // Saved optimizations
  // ----------------------------
  const [savedOptimizations, setSavedOptimizations] = useState(() => {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(SAVED_OPT_KEY)
        : null;
    const parsed = raw ? safeJsonParse(raw, []) : [];
    return Array.isArray(parsed) ? parsed : [];
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SAVED_OPT_KEY,
        JSON.stringify(savedOptimizations || [])
      );
    } catch (e) {
      console.warn("Failed to persist saved optimizations:", e);
    }
  }, [savedOptimizations]);

  // For convenience: map id -> optimization
  const savedById = useMemo(() => {
    const m = new Map();
    (savedOptimizations || []).forEach((o) => {
      if (o && o.id) m.set(o.id, o);
    });
    return m;
  }, [savedOptimizations]);

  const saveOptimization = (opt) => {
    if (!opt || !opt.id || !opt.name || !opt.snapshot) return;

    setSavedOptimizations((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const without = arr.filter((x) => x?.id !== opt.id);
      return [opt, ...without].slice(0, 50);
    });

    (async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/user/saved-optimizations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            optimization_id: String(opt.id),
            name: String(opt.name),
            created_at: Number(opt.createdAt || Date.now()),
            snapshot: opt.snapshot || {},
            guest_id: guestTrackingId || undefined,
          }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const payload = await resp.json();
        if (Array.isArray(payload?.saved_optimizations)) {
          setSavedOptimizations(payload.saved_optimizations);
        }
      } catch (e) {
        console.warn("Failed to persist saved optimization to API:", e);
      }
    })();
  };

  const deleteOptimization = (id) => {
    if (!id) return;
    setSavedOptimizations((prev) =>
      (Array.isArray(prev) ? prev : []).filter((x) => x?.id !== id)
    );

    (async () => {
      try {
        const q = guestTrackingId
          ? `?guest_id=${encodeURIComponent(String(guestTrackingId))}`
          : "";
        const resp = await fetch(
          `${API_BASE_URL}/user/saved-optimizations/${encodeURIComponent(String(id))}${q}`,
          { method: "DELETE", headers: { ...authHeaders } }
        );
        if (!resp.ok) throw new Error(await resp.text());
        const payload = await resp.json();
        if (Array.isArray(payload?.saved_optimizations)) {
          setSavedOptimizations(payload.saved_optimizations);
        }
      } catch (e) {
        console.warn("Failed to delete saved optimization from API:", e);
      }
    })();
  };

  const loadOptimization = (id) => {
    if (!id) return;
    const opt = savedById.get(id);
    if (!opt?.snapshot) return;

    const params = opt.snapshot.params || {};
    const result = opt.snapshot.result || {};
    const loadedData = result.data ?? null;

    const savedBannedPlayers = result.bannedPlayersData;
    setBannedPlayersData(Array.isArray(savedBannedPlayers) ? savedBannedPlayers : []);
    const savedLockedPlayers = result.lockedPlayersData;
    setLockedPlayersData(Array.isArray(savedLockedPlayers) ? savedLockedPlayers : []);

    setTeamId(params.teamId ?? "");
    setBbRound(params.bbRound ?? "");
    setWildRound(params.wildRound ?? "");
    setfreehitROund(params.freehitROund ?? "");
    setBannedList(Array.isArray(params.bannedList) ? params.bannedList : []);
    setLockedInList(Array.isArray(params.lockedInList) ? params.lockedInList : []);
    setn_hits(
      params.n_hits === 0 || params.n_hits ? String(params.n_hits) : ""
    );
    setRisk(Number(params.risk) || 0);
    setValtrans(
      Number.isFinite(Number(params.valtrans)) ? Number(params.valtrans) : 0.5
    );

    if (Array.isArray(loadedData) && loadedData.length) {
      setData(loadedData);

      const bl = Array.isArray(params.bannedList) ? params.bannedList : [];
      const derived = bl
        .map((sid) => {
          const p = loadedData.find(
            (row) => row?.Name?.toString() === sid?.toString()
          );
          if (!p) return null;
          return { Name: p.Name, web_name: p.web_name, photo: p.photo };
        })
        .filter(Boolean);

      // IMPORTANT: merge, do not wipe
      setBannedPlayersData((prev) => mergePlayersData(prev, derived));

      const ll = Array.isArray(params.lockedInList) ? params.lockedInList : [];
      const derivedLocked = derivePlayersFromRows(loadedData, ll);
      setLockedPlayersData((prev) => mergePlayersData(prev, derivedLocked));
    } else {
      setData(null);
      // keep bannedPlayersData (do not wipe) because bannedList still exists
      // only wipe if you want a hard reset - we avoid that to prevent "visual empty"
    }

    setOptimizationProgress({
      expectedSolutions: OPTIMIZATION_SOLUTIONS,
      receivedSolutions: 0,
      streaming: false,
    });
    setLoading(false);
    sethas_changed(false);
  };

  useEffect(() => {
    if (!hasSession) return;
    let cancelled = false;
    (async () => {
      try {
        const q = guestTrackingId
          ? `?guest_id=${encodeURIComponent(String(guestTrackingId))}`
          : "";
        const resp = await fetch(`${API_BASE_URL}/user/saved-optimizations${q}`, {
          headers: { ...authHeaders },
        });
        if (!resp.ok) throw new Error(await resp.text());
        const payload = await resp.json();
        if (cancelled) return;
        if (Array.isArray(payload?.saved_optimizations)) {
          setSavedOptimizations(payload.saved_optimizations);
        }
      } catch (e) {
        console.warn("Failed loading saved optimizations from API:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, guestTrackingId, hasSession]);

  /**
   * Fetch current team data from Get_My_Team endpoint
   */
  const fetchMyTeam = async () => {
    if (!teamId) {
      alert("Team ID is required");
      return;
    }

    setTeamLoading(true);
    try {
      const url = `${API_BASE_URL}/Get_My_Team?team_id=${teamId}`;
      const resp = await fetch(url, { headers: { ...authHeaders } });
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      setTeamData(json);
      await recordRecentTeamId(teamId);
    } catch (err) {
      console.error(err);
      alert("Error fetching team data: " + err.message);
    } finally {
      setTeamLoading(false);
    }
  };

  /**
   * fetchTeam can optionally take:
   *  - useStatisticalModel: boolean
   *  - playersData: array of player rows
   */
  const fetchTeam = async (options = {}) => {
    const { useStatisticalModel = false, playersData = null } = options;

    if (!teamId) return alert("Team ID is required");
    setLoading(true);
    setData(null);
    setOptimizationProgress({
      expectedSolutions: OPTIMIZATION_SOLUTIONS,
      receivedSolutions: 0,
      streaming: true,
    });

    try {
      const consumeStreamResponse = async (resp) => {
        if (!resp.body || typeof resp.body.getReader !== "function") {
          const fallbackJson = await resp.json();
          setData(fallbackJson);

          const derivedBanned = derivePlayersFromRows(fallbackJson, bannedList);
          setBannedPlayersData((prev) => mergePlayersData(prev, derivedBanned));

          const derivedLocked = derivePlayersFromRows(fallbackJson, lockedInList);
          setLockedPlayersData((prev) => mergePlayersData(prev, derivedLocked));

          setOptimizationProgress({
            expectedSolutions: OPTIMIZATION_SOLUTIONS,
            receivedSolutions: OPTIMIZATION_SOLUTIONS,
            streaming: false,
          });
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let hasShownFirstSolution = false;

        const processEvent = (rawEvent) => {
          const lines = String(rawEvent || "")
            .split(/\r?\n/)
            .filter(Boolean);
          if (!lines.length) return;

          let eventType = "message";
          const dataLines = [];

          lines.forEach((line) => {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          });

          if (!dataLines.length) return;

          let payload = null;
          try {
            payload = JSON.parse(dataLines.join("\n"));
          } catch (e) {
            console.warn("Failed to parse optimization stream event:", e);
            return;
          }

          if (eventType === "meta") {
            const expected = Number(payload?.n_solutions) || OPTIMIZATION_SOLUTIONS;
            setOptimizationProgress((prev) => ({
              ...prev,
              expectedSolutions: expected,
            }));
            return;
          }

          if (eventType === "solution") {
            const solutionNo = Number(payload?.solution);
            const rows = Array.isArray(payload?.rows) ? payload.rows : [];
            if (!rows.length) return;

            setData((prev) => mergeRowsBySolution(prev, rows));

            const derivedBanned = derivePlayersFromRows(rows, bannedList);
            if (derivedBanned.length) {
              setBannedPlayersData((prev) => mergePlayersData(prev, derivedBanned));
            }

            const derivedLocked = derivePlayersFromRows(rows, lockedInList);
            if (derivedLocked.length) {
              setLockedPlayersData((prev) => mergePlayersData(prev, derivedLocked));
            }

            if (Number.isFinite(solutionNo)) {
              setOptimizationProgress((prev) => ({
                ...prev,
                receivedSolutions: Math.max(prev.receivedSolutions, solutionNo),
              }));
            }

            if (!hasShownFirstSolution) {
              hasShownFirstSolution = true;
              setLoading(false);
            }
            return;
          }

          if (eventType === "error") {
            throw new Error(payload?.detail || "Optimization stream failed.");
          }

          if (eventType === "done") {
            setOptimizationProgress((prev) => ({
              ...prev,
              streaming: false,
              receivedSolutions: Math.max(
                prev.receivedSolutions,
                Number(payload?.solutions_found) ||
                  Number(payload?.n_solutions) ||
                  prev.receivedSolutions
              ),
            }));
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";
          events.forEach(processEvent);
        }

        if (buffer.trim()) processEvent(buffer);
        if (!hasShownFirstSolution) setLoading(false);
      };

      // --------- AI model: GET query params ---------
      if (!useStatisticalModel) {
        const params = new URLSearchParams({ team_id: teamId });

        if (bbRound) params.append("bb_round", bbRound);
        if (wildRound) params.append("wildcard_round", wildRound);
        if (freehitROund) params.append("freehit_round", freehitROund);
        (bannedList || []).forEach((id) => params.append("banned_list", id));
        (lockedInList || []).forEach((id) => params.append("force_in_list", id));
        if (n_hits) params.append("n_hits", n_hits);

        params.append("risk", String(Number(risk) || 0));
        params.append("transval", String(Number(valtrans) || 0));
        params.append("stream", "true");
        if (guestTrackingId) params.append("guest_id", String(guestTrackingId));

        const url = `${API_BASE_URL}/My_Team_Optimize?${params.toString()}`;
        const resp = await fetch(url, { headers: { ...authHeaders } });
        if (!resp.ok) throw new Error(await resp.text());
        await consumeStreamResponse(resp);
        await recordRecentTeamId(teamId);

        return;
      }

      // --------- Statistical model: POST JSON body ---------
      if (!Array.isArray(playersData) || playersData.length === 0) {
        alert("No player data available for statistical model.");
        return;
      }

      const slimPlayers = playersData.map((p) => ({
        name: p.name,
        web_name: p.web_name,
        Team: p.Team,
        GW: p.GW,
        position: p.position,
        value: p.value,
        Points: p.calc_points,
      }));

      const body = {
        team_id: Number(teamId),
        banned_list: bannedList,
        force_in_list: lockedInList,
        bb_round: bbRound ? Number(bbRound) : 40,
        wildcard_round: wildRound ? Number(wildRound) : 40,
        freehit_round: freehitROund ? Number(freehitROund) : 40,
        n_hits: n_hits ? Number(n_hits) : 0,
        model_type: "statistical",
        players: slimPlayers,
        risk: Number(risk) || 0,
        transval: Number(valtrans) || 0.5,
        stream: true,
        guest_id: guestTrackingId || undefined,
      };

      const resp = await fetch(
        `${API_BASE_URL}/My_Team_Optimize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(body),
        }
      );

      if (!resp.ok) throw new Error(await resp.text());
      await consumeStreamResponse(resp);
      await recordRecentTeamId(teamId);
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
      setOptimizationProgress((prev) => ({ ...prev, streaming: false }));
    } finally {
      setLoading(false);
      setOptimizationProgress((prev) => ({ ...prev, streaming: false }));
    }
  };

  /**
   * TRUE toggle:
   * - If player is already banned => unban and remove chip
   * - Else => ban and add chip (if data available)
   */
  const toggleBan = (id) => {
    const sid = id.toString();
    const isAddingBan = !(Array.isArray(bannedList) ? bannedList : []).includes(sid);

    setBannedList((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.includes(sid) ? arr.filter((x) => x !== sid) : [...arr, sid];
    });

    if (isAddingBan) {
      setLockedInList((prev) =>
        (Array.isArray(prev) ? prev : []).filter((x) => x !== sid)
      );
      setLockedPlayersData((prev) =>
        (Array.isArray(prev) ? prev : []).filter(
          (p) => p?.Name?.toString() !== sid
        )
      );
    }

    setBannedPlayersData((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const exists = arr.some((p) => p?.Name?.toString() === sid);

      // If exists -> remove
      if (exists) return arr.filter((p) => p?.Name?.toString() !== sid);

      // If not exists -> add (only if we can find it in current data)
      const player = data?.find((p) => p?.Name?.toString() === sid);
      if (!player) return arr;

      return mergePlayersData(arr, [
        { Name: player.Name, web_name: player.web_name, photo: player.photo },
      ]);
    });
  };

  const removeBan = (id) => {
    const sid = id.toString();
    setBannedList((prev) =>
      (Array.isArray(prev) ? prev : []).filter((x) => x !== sid)
    );
    setBannedPlayersData((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (p) => p?.Name?.toString() !== sid
      )
    );
  };

  const toggleLockIn = (id, playerMeta = null) => {
    const sid = id?.toString();
    if (!sid) return;
    const isAddingLock = !(Array.isArray(lockedInList) ? lockedInList : []).includes(sid);

    setLockedInList((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.includes(sid) ? arr.filter((x) => x !== sid) : [...arr, sid];
    });

    if (isAddingLock) {
      setBannedList((prev) =>
        (Array.isArray(prev) ? prev : []).filter((x) => x !== sid)
      );
      setBannedPlayersData((prev) =>
        (Array.isArray(prev) ? prev : []).filter(
          (p) => p?.Name?.toString() !== sid
        )
      );
    }

    setLockedPlayersData((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const exists = arr.some((p) => p?.Name?.toString() === sid);
      if (exists) return arr.filter((p) => p?.Name?.toString() !== sid);

      const fromMeta = playerMeta?.Name ? playerMeta : null;
      const fromData = data?.find((p) => p?.Name?.toString() === sid);
      const player = fromMeta || fromData;
      if (!player) return arr;

      return mergePlayersData(arr, [
        {
          Name: player.Name,
          web_name: player.web_name,
          photo: player.photo,
        },
      ]);
    });
  };

  const removeLockIn = (id) => {
    const sid = id?.toString();
    if (!sid) return;
    setLockedInList((prev) =>
      (Array.isArray(prev) ? prev : []).filter((x) => x !== sid)
    );
    setLockedPlayersData((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (p) => p?.Name?.toString() !== sid
      )
    );
  };

  return (
    <MyTeamDataContext.Provider
      value={{
        teamId,
        setTeamId,

        bbRound,
        setBbRound,
        wildRound,
        setWildRound,
        freehitROund,
        setfreehitROund,

        bannedList,
        bannedPlayersData,
        lockedInList,
        lockedPlayersData,

        data,
        teamData,

        loading,
        teamLoading,
        optimizationProgress,

        fetchTeam,
        fetchMyTeam,

        toggleBan,
        removeBan,
        toggleLockIn,
        removeLockIn,

        has_changed,
        sethas_changed,

        n_hits,
        setn_hits,
        risk,
        setRisk,
        valtrans,
        setValtrans,

        // Saved optimizations
        savedOptimizations,
        saveOptimization,
        deleteOptimization,
        loadOptimization,
      }}
    >
      {children}
    </MyTeamDataContext.Provider>
  );
}
