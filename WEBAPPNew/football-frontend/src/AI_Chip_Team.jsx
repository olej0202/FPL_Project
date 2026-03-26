import React, { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import pitch from "./assets/Pitch4.png";
import { useAITeamData } from "./Contexts/AITeamsContext";

const fallbackUrl =
  "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";

const isValidGW = (gw) => Number.isInteger(gw) && gw >= 1 && gw <= 38;

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function sortBench(players) {
  return [...players].sort((a, b) => {
    if (a.position === "GKP") return -1;
    if (b.position === "GKP") return 1;
    return 0;
  });
}

function buildTransferGroups(rows) {
  const transferRows = rows.filter((p) =>
    ["transferred_in", "transferred_out"].includes(normalizeStatus(p.status))
  );

  return Object.values(
    transferRows.reduce((acc, curr) => {
      const gw = Number(curr.GW);
      if (!isValidGW(gw)) return acc;

      if (!acc[gw]) acc[gw] = { GW: gw, in: [], out: [] };
      acc[gw][normalizeStatus(curr.status) === "transferred_in" ? "in" : "out"].push(curr);
      return acc;
    }, {})
  ).sort((a, b) => a.GW - b.GW);
}

export default function AIChipTeam() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { fetchIfNeeded, freeHitData, wildcardData, loading, dataVersion } = useAITeamData();

  const mode = searchParams.get("mode") === "freehit" ? "freehit" : "wildcard";

  useEffect(() => {
    fetchIfNeeded();
  }, [fetchIfNeeded]);

  const rows = useMemo(
    () => (mode === "freehit" ? freeHitData?.current || [] : wildcardData?.current || []),
    [mode, freeHitData, wildcardData, dataVersion]
  );

  const { minGW, playingPlayers, benchPlayers, transfers } = useMemo(() => {
    const gws = rows
      .map((p) => Number(p.GW))
      .filter((gw) => isValidGW(gw));
    const minGW = gws.length ? Math.min(...gws) : null;

    const forGW = minGW == null ? [] : rows.filter((p) => Number(p.GW) === minGW);

    const playingPlayers = forGW.filter((p) => normalizeStatus(p.status) === "playing");
    const benchPlayers = forGW.filter((p) => {
      const s = normalizeStatus(p.status);
      return s === "bench" || s === "benched";
    });

    const transfers = buildTransferGroups(rows);

    return { minGW, playingPlayers, benchPlayers, transfers };
  }, [rows]);

  const setMode = (next) => {
    const nextMode = next === "freehit" ? "freehit" : "wildcard";
    setSearchParams({ mode: nextMode }, { replace: true });
  };

  const getPlayersByPosition = (pos) =>
    playingPlayers.filter((p) => p.position === pos);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800 flex flex-col items-center py-4 px-1 space-y-3">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => setMode("wildcard")}
          className={[
            "px-4 py-1.5 rounded-full text-sm font-semibold transition",
            mode === "wildcard"
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
              : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
        >
          Wildcard
        </button>
        <button
          type="button"
          onClick={() => setMode("freehit")}
          className={[
            "px-4 py-1.5 rounded-full text-sm font-semibold transition",
            mode === "freehit"
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
              : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
        >
          Free Hit
        </button>
      </div>

      <h1 className="text-3xl md:text-4xl font-bold text-center mb-1">
        AI Optimized {mode === "freehit" ? "Free Hit" : "Wildcard"} Team GW {minGW ?? "—"}
      </h1>
      <span className="mt-0 text-center text-xs sm:text-sm leading-tight text-slate-500">
        Click on players to get stats
      </span>

      {loading && rows.length === 0 ? (
        <div className="text-slate-600">Loading...</div>
      ) : (
        <>
          <div
            className="w-full max-w-[500px] aspect-[3/5] bg-no-repeat bg-cover bg-center border border-slate-200 rounded-lg shadow-sm px-2 py-1 relative"
            style={{ backgroundImage: `url(${pitch})` }}
          >
            <div className="flex flex-col justify-between h-[700px] pt-1 space-y-1">
              <PlayerRow players={getPlayersByPosition("GKP")} navigate={navigate} />
              <PlayerRow players={getPlayersByPosition("DEF")} navigate={navigate} />
              <PlayerRow players={getPlayersByPosition("MID")} navigate={navigate} />
              <PlayerRow players={getPlayersByPosition("FWD")} navigate={navigate} />
              <div className="h-[115px]" />
            </div>

            {benchPlayers.length > 0 && (
              <div className="absolute bottom-[-4px] left-0 right-0 px-2">
                <PlayerRow players={sortBench(benchPlayers)} isBench navigate={navigate} />
              </div>
            )}
          </div>

          <div className="w-full max-w-2xl mt-8">
            <h2 className="text-2xl font-bold text-center mb-4">Transfers</h2>

            {transfers.length === 0 ? (
              <div className="text-center text-slate-500 text-sm">
                No transfers available.
              </div>
            ) : (
              transfers.map((t) => {
                const remainingIns = [...t.in];
                const pairs = t.out.map((outPlayer) => {
                  const matchIdx = remainingIns.findIndex(
                    (inPlayer) => inPlayer.position === outPlayer.position
                  );
                  if (matchIdx !== -1) {
                    const [matchedIn] = remainingIns.splice(matchIdx, 1);
                    return { outPlayer, inPlayer: matchedIn };
                  }
                  return { outPlayer, inPlayer: null };
                });
                remainingIns.forEach((inPlayer) => pairs.push({ outPlayer: null, inPlayer }));

                return (
                  <div key={t.GW} className="mb-6">
                    <h3 className="text-lg font-semibold mb-2 text-center">GW {t.GW}</h3>
                    <div className="flex flex-wrap justify-center gap-10 items-center">
                      {pairs.map(({ outPlayer, inPlayer }, idx) => (
                        <div key={`${t.GW}_${idx}`} className="flex items-center gap-2">
                          {outPlayer && <TransferCard player={outPlayer} label="Out" navigate={navigate} />}
                          {outPlayer && inPlayer && <ArrowRight className="text-emerald-700" />}
                          {inPlayer && <TransferCard player={inPlayer} label="In" navigate={navigate} />}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PlayerRow({ players, isBench = false, navigate }) {
  return (
    <div className="flex justify-center gap-3 py-2 overflow-x-auto">
      {players.map((player, idx) => {
        const name = player.web_name;
        return (
          <div
            key={`${player.Name}_${idx}`}
            onClick={() =>
              navigate("/Player_Analytics/Individual", {
                state: { selectedPlayer: player.Name },
              })
            }
            className="relative flex flex-col items-center cursor-pointer hover:scale-105 transition-transform"
          >
            <div className="absolute inset-0 bg-gray-400/20 backdrop-blur-sm rounded-xl" />

            {player.Is_captain && (
              <div className="absolute top-0 -left-2 bg-emerald-700 text-white font-bold text-xs rounded-full w-5 h-5 flex items-center justify-center z-10">
                C
              </div>
            )}

            <img
              src={player.photo}
              alt={player.Name}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = fallbackUrl;
              }}
              className="relative z-10 object-contain w-[60px] h-[80px] sm:w-[70px] sm:h-[90px]"
            />

            <span className="relative z-10 mt-1 px-3 py-1 bg-white/90 text-slate-800 text-xs sm:text-sm rounded-full shadow-md text-center leading-tight">
              {name}
            </span>

            {isBench && (
              <span className="relative z-10 text-xs text-slate-600 mt-1">{player.position}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TransferCard({ player, label, navigate }) {
  const name = player.web_name;
  return (
    <div
      className="flex flex-col items-center cursor-pointer"
      onClick={() =>
        navigate("/Player_Analytics/Individual", {
          state: { selectedPlayer: player.Name },
        })
      }
    >
      <img
        src={player.photo}
        alt={name}
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = fallbackUrl;
        }}
        className="w-[50px] h-[70px] sm:w-[60px] sm:h-[80px] object-contain border-2 border-none rounded"
      />
      <span className="text-xs mt-1">{name}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

