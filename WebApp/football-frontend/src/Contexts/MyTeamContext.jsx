// src/context/DataContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const MyTeamDataContext = createContext();

export const useMyteamData = () => useContext(MyTeamDataContext);

// LocalStorage key (scoped so you can change later without breaking other storage)
const SAVED_OPT_KEY = "myteam_saved_optimizations_v1";

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function MyTeamDataContextProvider({ children }) {
  const [teamId, setTeamId] = useState("");
  const [bbRound, setBbRound] = useState("");
  const [wildRound, setWildRound] = useState("");
  const [freehitROund, setfreehitROund] = useState("");
  const [bannedList, setBannedList] = useState([]);
  const [data, setData] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [has_changed, sethas_changed] = useState(false);
  const [bannedPlayersData, setBannedPlayersData] = useState([]);
  const [n_hits, setn_hits] = useState("");
  const [risk, setRisk] = useState(0);
  const [valtrans, setValtrans] = useState(0.5);

  // ----------------------------
  // NEW: Saved optimizations
  // ----------------------------
  const [savedOptimizations, setSavedOptimizations] = useState(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(SAVED_OPT_KEY) : null;
    const parsed = raw ? safeJsonParse(raw, []) : [];
    return Array.isArray(parsed) ? parsed : [];
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_OPT_KEY, JSON.stringify(savedOptimizations || []));
    } catch (e) {
      // If storage fails (private mode / quota), don't crash app
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
    // Expected opt shape:
    // { id, name, createdAt, snapshot: { params: {...}, result: { data } } }
    if (!opt || !opt.id || !opt.name || !opt.snapshot) return;

    setSavedOptimizations((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      // overwrite if same id exists
      const without = arr.filter((x) => x?.id !== opt.id);
      // newest first
      return [opt, ...without].slice(0, 50); // keep last 50 to avoid huge storage
    });
  };

  const deleteOptimization = (id) => {
    if (!id) return;
    setSavedOptimizations((prev) =>
      (Array.isArray(prev) ? prev : []).filter((x) => x?.id !== id)
    );
  };

  const loadOptimization = (id) => {
    if (!id) return;
    const opt = savedById.get(id);
    if (!opt?.snapshot) return;

    const params = opt.snapshot.params || {};
    const result = opt.snapshot.result || {};
    const loadedData = result.data ?? null;

    // Apply saved parameters into context (as if user set them)
    setTeamId(params.teamId ?? "");
    setBbRound(params.bbRound ?? "");
    setWildRound(params.wildRound ?? "");
    setfreehitROund(params.freehitROund ?? "");
    setBannedList(Array.isArray(params.bannedList) ? params.bannedList : []);
    setn_hits(
      params.n_hits === 0 || params.n_hits
        ? String(params.n_hits)
        : "" // keep original pattern (string)
    );
    setRisk(Number(params.risk) || 0);
    setValtrans(
      Number.isFinite(Number(params.valtrans)) ? Number(params.valtrans) : 0.5
    );

    // Also restore bannedPlayersData if possible (derive from data if present)
    if (Array.isArray(loadedData) && loadedData.length) {
      setData(loadedData);

      // Derive banned player chips data from loadedData + bannedList
      const bl = Array.isArray(params.bannedList) ? params.bannedList : [];
      const derived = bl
        .map((sid) => {
          const p = loadedData.find((row) => row?.Name?.toString() === sid?.toString());
          if (!p) return null;
          return { Name: p.Name, web_name: p.web_name, photo: p.photo };
        })
        .filter(Boolean);

      setBannedPlayersData(derived);
    } else {
      setData(null);
      setBannedPlayersData([]);
    }

    setLoading(false);
    sethas_changed(false);
  };

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
      const url = `https://fpl-project-t5e9.onrender.com/Get_My_Team?team_id=${teamId}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      setTeamData(json);
    } catch (err) {
      console.error(err);
      alert("Error fetching team data: " + err.message);
    } finally {
      setTeamLoading(false);
    }
  };

  /**
   * fetchTeam can now optionally take:
   *  - useStatisticalModel: boolean
   *  - playersData: array of player rows (from AdjustmentData)
   *
   * Example: fetchTeam({ useStatisticalModel: true, playersData })
   */
  const fetchTeam = async (options = {}) => {
    const { useStatisticalModel = false, playersData = null } = options;

    if (!teamId) return alert("Team ID is required");
    setLoading(true);

    try {
      // --------- AI model (unchanged): GET query params ---------
      if (!useStatisticalModel) {
        const params = new URLSearchParams({ team_id: teamId });

        if (bbRound) params.append("bb_round", bbRound);
        if (wildRound) params.append("wildcard_round", wildRound);
        if (freehitROund) params.append("freehit_round", freehitROund);
        bannedList.forEach((id) => params.append("banned_list", id));
        if (n_hits) params.append("n_hits", n_hits);
        params.append("risk", String(Number(risk) || 0));
        params.append("transval", String(Number(valtrans) || 0));

        const url = `https://fpl-project-t5e9.onrender.com/My_Team_Optimize?${params.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(await resp.text());
        const json = await resp.json();
        setData(json);

        // Keep banned players chips in sync if the user has some banned already
        if (Array.isArray(bannedList) && bannedList.length) {
          const derived = bannedList
            .map((sid) => {
              const p = json?.find((row) => row?.Name?.toString() === sid?.toString());
              if (!p) return null;
              return { Name: p.Name, web_name: p.web_name, photo: p.photo };
            })
            .filter(Boolean);
          setBannedPlayersData(derived);
        }

        return;
      }

      // --------- Statistical model: POST JSON body ---------
      if (!Array.isArray(playersData) || playersData.length === 0) {
        alert("No player data available for statistical model.");
        return;
      }

      const slimPlayers = playersData.map((p) => ({
        // must match PlayerInput exactly
        name: p.name,
        web_name: p.web_name,
        Team: p.Team,
        GW: p.GW,
        position: p.position,
        value: p.value,
        Points: p.calc_points, // from PlayerAdjustmentsPage
      }));

      const body = {
        team_id: Number(teamId),
        banned_list: bannedList,
        bb_round: bbRound ? Number(bbRound) : 40,
        wildcard_round: wildRound ? Number(wildRound) : 40,
        freehit_round: freehitROund ? Number(freehitROund) : 40,
        n_hits: n_hits ? Number(n_hits) : 0,
        model_type: "statistical",
        players: slimPlayers,
        risk: Number(risk) || 0,
        transval: Number(valtrans) || 0.5,
      };

      const resp = await fetch("https://fpl-project-t5e9.onrender.com/My_Team_Optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      setData(json);

      // Keep banned players chips in sync
      if (Array.isArray(bannedList) && bannedList.length) {
        const derived = bannedList
          .map((sid) => {
            const p = json?.find((row) => row?.Name?.toString() === sid?.toString());
            if (!p) return null;
            return { Name: p.Name, web_name: p.web_name, photo: p.photo };
          })
          .filter(Boolean);
        setBannedPlayersData(derived);
      }
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBan = (id) => {
    const sid = id.toString();
    setBannedList((prev) => (prev.includes(sid) ? prev : [...prev, sid]));

    // Try to build bannedPlayersData from current optimization data
    const player = data?.find((p) => p?.Name?.toString() === sid);
    if (player) {
      const slim = {
        Name: player.Name,
        web_name: player.web_name,
        photo: player.photo,
      };
      setBannedPlayersData((prev) =>
        prev.find((p) => p?.Name?.toString() === sid) ? prev : [...prev, slim]
      );
    }
  };

  const removeBan = (id) => {
    const sid = id.toString();
    setBannedList((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : prev));
    setBannedPlayersData((prev) => prev.filter((p) => p?.Name?.toString() !== sid));
  };

  return (
    <MyTeamDataContext.Provider
      value={{
        teamId,
        bannedPlayersData,
        setTeamId,
        bbRound,
        setBbRound,
        wildRound,
        setWildRound,
        freehitROund,
        setfreehitROund,
        bannedList,
        data,
        teamData,
        loading,
        teamLoading,
        fetchTeam,
        fetchMyTeam,
        toggleBan,
        removeBan,
        has_changed,
        sethas_changed,
        n_hits,
        setn_hits,
        risk,
        setRisk,
        valtrans,
        setValtrans,

        // NEW: saved optimizations exposed to pages
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
