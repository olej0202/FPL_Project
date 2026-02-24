// src/context/DataContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const MyTeamDataContext = createContext();
export const useMyteamData = () => useContext(MyTeamDataContext);

// LocalStorage key
const SAVED_OPT_KEY = "myteam_saved_optimizations_v1";

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
function mergeBannedPlayersData(prev, next) {
  const map = new Map();

  (Array.isArray(prev) ? prev : []).forEach((p) => {
    if (p?.Name != null) map.set(p.Name.toString(), p);
  });

  (Array.isArray(next) ? next : []).forEach((p) => {
    if (p?.Name != null) map.set(p.Name.toString(), p); // overwrite with newest
  });

  return Array.from(map.values());
}

export function MyTeamDataContextProvider({ children }) {
  const [teamId, setTeamId] = useState("");
  const [bbRound, setBbRound] = useState("");
  const [wildRound, setWildRound] = useState("");
  const [freehitROund, setfreehitROund] = useState("");

  const [bannedList, setBannedList] = useState([]);
  const [bannedPlayersData, setBannedPlayersData] = useState([]);

  const [data, setData] = useState(null);
  const [teamData, setTeamData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);

  const [has_changed, sethas_changed] = useState(false);

  const [n_hits, setn_hits] = useState("");
  const [risk, setRisk] = useState(0);
  const [valtrans, setValtrans] = useState(0.5);

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

    const savedBannedPlayers = result.bannedPlayersData;
    if (Array.isArray(savedBannedPlayers) && savedBannedPlayers.length) {
      setBannedPlayersData(savedBannedPlayers);
    }

    setTeamId(params.teamId ?? "");
    setBbRound(params.bbRound ?? "");
    setWildRound(params.wildRound ?? "");
    setfreehitROund(params.freehitROund ?? "");
    setBannedList(Array.isArray(params.bannedList) ? params.bannedList : []);
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
      setBannedPlayersData((prev) => mergeBannedPlayersData(prev, derived));
    } else {
      setData(null);
      // keep bannedPlayersData (do not wipe) because bannedList still exists
      // only wipe if you want a hard reset - we avoid that to prevent "visual empty"
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
   * fetchTeam can optionally take:
   *  - useStatisticalModel: boolean
   *  - playersData: array of player rows
   */
  const fetchTeam = async (options = {}) => {
    const { useStatisticalModel = false, playersData = null } = options;

    if (!teamId) return alert("Team ID is required");
    setLoading(true);

    try {
      // --------- AI model: GET query params ---------
      if (!useStatisticalModel) {
        const params = new URLSearchParams({ team_id: teamId });

        if (bbRound) params.append("bb_round", bbRound);
        if (wildRound) params.append("wildcard_round", wildRound);
        if (freehitROund) params.append("freehit_round", freehitROund);
        (bannedList || []).forEach((id) => params.append("banned_list", id));
        if (n_hits) params.append("n_hits", n_hits);

        params.append("risk", String(Number(risk) || 0));
        params.append("transval", String(Number(valtrans) || 0));

        const url = `https://fpl-project-t5e9.onrender.com/My_Team_Optimize?${params.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(await resp.text());
        const json = await resp.json();
        setData(json);

        // IMPORTANT: merge derived chips so UI doesn't empty
        if (Array.isArray(bannedList) && bannedList.length) {
          const derived = bannedList
            .map((sid) => {
              const p = json?.find(
                (row) => row?.Name?.toString() === sid?.toString()
              );
              if (!p) return null;
              return { Name: p.Name, web_name: p.web_name, photo: p.photo };
            })
            .filter(Boolean);

          setBannedPlayersData((prev) => mergeBannedPlayersData(prev, derived));
        }

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
        bb_round: bbRound ? Number(bbRound) : 40,
        wildcard_round: wildRound ? Number(wildRound) : 40,
        freehit_round: freehitROund ? Number(freehitROund) : 40,
        n_hits: n_hits ? Number(n_hits) : 0,
        model_type: "statistical",
        players: slimPlayers,
        risk: Number(risk) || 0,
        transval: Number(valtrans) || 0.5,
      };

      const resp = await fetch(
        "https://fpl-project-t5e9.onrender.com/My_Team_Optimize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      setData(json);

      // IMPORTANT: merge derived chips so UI doesn't empty
      if (Array.isArray(bannedList) && bannedList.length) {
        const derived = bannedList
          .map((sid) => {
            const p = json?.find(
              (row) => row?.Name?.toString() === sid?.toString()
            );
            if (!p) return null;
            return { Name: p.Name, web_name: p.web_name, photo: p.photo };
          })
          .filter(Boolean);

        setBannedPlayersData((prev) => mergeBannedPlayersData(prev, derived));
      }
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * TRUE toggle:
   * - If player is already banned => unban and remove chip
   * - Else => ban and add chip (if data available)
   */
  const toggleBan = (id) => {
    const sid = id.toString();

    setBannedList((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.includes(sid) ? arr.filter((x) => x !== sid) : [...arr, sid];
    });

    setBannedPlayersData((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const exists = arr.some((p) => p?.Name?.toString() === sid);

      // If exists -> remove
      if (exists) return arr.filter((p) => p?.Name?.toString() !== sid);

      // If not exists -> add (only if we can find it in current data)
      const player = data?.find((p) => p?.Name?.toString() === sid);
      if (!player) return arr;

      return mergeBannedPlayersData(arr, [
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