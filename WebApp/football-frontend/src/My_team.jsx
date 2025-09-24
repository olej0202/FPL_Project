// src/pages/OptimizeTeam.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import pitch from "./assets/pitch.png";
import { useMyteamData } from "./Contexts/MyTeamContext";

export default function MyTeamOptimize() {
  const {
    teamId,
    setTeamId,
    bbRound,
    setBbRound,
    wildRound,
    setWildRound,
    bannedList,
    freehitROund,
    setfreehitROund,
    data,
    loading,
    fetchTeam,
    toggleBan,
    removeBan,
    has_changed,
    sethas_changed,
    bannedPlayersData,
    n_hits, 
    setn_hits
  } = useMyteamData();

  const navigate = useNavigate();
  const [showBbInput, setShowBbInput] = useState(!!bbRound);
  const [showWildInput, setShowWildInput] = useState(!!wildRound);
  const [showfreehitInput, setshowfreehitInput] = useState(!!freehitROund);
  const [loadingPhase, setLoadingPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    sethas_changed(true);
  }, [teamId, bbRound, wildRound, bannedList, sethas_changed, freehitROund,n_hits]);
  useEffect(() => {
  if (loading) {
    setLoadingPhase("fetch");
    setProgress(0);

    // animate 0 → 40 over ~3s
    let rafId;
    const start = performance.now();
    const duration = 3000; // 3s
    const tick = (now) => {
      const elapsed = now - start;
      const pct = Math.min(40, (elapsed / duration) * 40);
      setProgress(pct);

      if (elapsed < duration && loading) {
        rafId = requestAnimationFrame(tick);
      } else if (loading) {
        setLoadingPhase("optimize");
        // gentle drift 40 → 90 while still loading
        let p = Math.max(pct, 40);
        const iv = setInterval(() => {
          if (!loading) return clearInterval(iv);
          p = Math.min(98, p + 1);
          setProgress(p);
          if (p >= 98) clearInterval(iv);
        }, 200);
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  } else {
    // finish to 100 then reset
    setProgress(100);
    const t = setTimeout(() => setProgress(0), 300);
    setLoadingPhase("idle");
    return () => clearTimeout(t);
  }
}, [loading]);

  if (loading) {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-80 max-w-[90vw]">
        <div className="mb-2 text-center text-sm text-gray-300">
          {loadingPhase === "fetch" ? "Fetching team…" : "Optimizing team…"}
        </div>

        <div className="h-2 w-full bg-gray-700 rounded overflow-hidden">
          <div
            className="h-full bg-royal-gold transition-[width] duration-200 ease-out"
            style={{ width: `${progress}%` }}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            role="progressbar"
          />
        </div>

        <div className="mt-2 text-center text-xs text-gray-500 animate-pulse">
          This can take a moment…
        </div>
      </div>
    </div>
  );
}

  // --- Compute GWs and split squad ---
  let minGW=1, maxGW=38, starters = [], bench = [], transfers = [], gwData = [];
  if (data) {
    const gws = data.map((p) => Number(p.GW)).filter((n) => !isNaN(n));
    if (gws.length) {
      minGW = Math.min(...gws);
      maxGW = Math.min(38,minGW+5);
    }
    gwData = data.filter((p) => Number(p.GW) === minGW);
    starters = gwData.filter((p) => p.status === "playing");
    bench = gwData.filter((p) => p.status === "benched");

    // group transfers by GW
    const moves = data.filter((p) =>
      ["transferred_in", "transferred_out"].includes(p.status)
    );
    transfers = Object.values(
      moves.reduce((acc, curr) => {
        if (!acc[curr.GW]) acc[curr.GW] = { GW: curr.GW, in: [], out: [] };
        acc[curr.GW][curr.status === "transferred_in" ? "in" : "out"].push(curr);
        return acc;
      }, {})
    ).sort((a, b) => Number(a.GW) - Number(b.GW));
  }

  // --- Total objective points ---
  let totalPredPoints = null;
  if (data) {
    const objRow =
      data.find((p) => p.Name === "Obj Value") ||
      (Array.isArray(gwData) && gwData.find((p) => p.Name === "Obj Value")) ||
      data.find((p) => p.Name === "__TOTAL_OBJECTIVE__");

    if (objRow) {
      const asNum =
        objRow.objective != null ? Number(objRow.objective) : Number(objRow.status);
      totalPredPoints = Number.isFinite(asNum) ? asNum : null;
    }
  }

  // --- Insert/mark Free Hit banner in the correct GW order ---
  const toNum = (v) => Number(v);
  let transfersWithFH = transfers;
  if (data && Number.isFinite(minGW) && Number.isFinite(maxGW)) {
    const fhGW = Number(freehitROund);
    const fhActive =
      Number.isFinite(fhGW) && fhGW >= minGW-1 && fhGW <= maxGW;

    if (fhActive) {
      const out = [...transfers].sort((a, b) => toNum(a.GW) - toNum(b.GW));
      const idx = out.findIndex((g) => toNum(g.GW) === fhGW);

      if (idx !== -1) {
        // Tag existing group
        out[idx] = { ...out[idx], freehit: true };
      } else {
        // Insert a banner-only group at correct position
        const insertAt = out.findIndex((g) => toNum(g.GW) > fhGW);
        const fhGroup = { GW: fhGW, in: [], out: [], freehit: true };
        if (insertAt === -1) out.push(fhGroup);
        else out.splice(insertAt, 0, fhGroup);
      }

      transfersWithFH = out;
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-0 py-4 space-y-8">
      <h1 className="text-3xl font-bold">Optimize My Team</h1>

      {/* Form */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="number"
          placeholder="Team ID *"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="w-40 p-2 bg-black border border-royal-gold rounded text-white text-center"
        />

        {/* Bench Boost */}
        {showBbInput ? (
          <>
            {minGW == null ? (
              <div className="w-40 p-2 text-center text-gray-400">Loading GWs…</div>
            ) : (
              <div className="relative w-40">
                <select
                  value={bbRound || ""}
                  onChange={(e) => setBbRound(Number(e.target.value))}
                  className="w-full p-2 bg-black border border-royal-gold rounded text-white text-center"
                >
                  <option value="" disabled>
                    Bench Boost GW
                  </option>
                  {Array.from({ length: maxGW - minGW + 1 }, (_, i) => minGW + i).map(
                    (gw) => (
                      <option key={gw} value={gw}>
                        GW {gw}
                      </option>
                    )
                  )}
                </select>
                <button
                  onClick={() => {
                    setShowBbInput(false);
                    setBbRound("");
                  }}
                  className="absolute top-2 -right-8 p-1 text-red-500 bg-black"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={() => {
              setShowBbInput(true);
              if (minGW != null) setBbRound(minGW);
            }}
            className="w-40 p-2 bg-transparent border border-dashed border-royal-gold rounded text-royal-gold hover:bg-yellow-300 hover:text-black transition"
          >
            + Add Bench Boost
          </button>
        )}

        {/* Wildcard */}
        {showWildInput ? (
          <>
            {minGW == null ? (
              <div className="w-40 p-2 text-center text-gray-400">Loading GWs…</div>
            ) : (
              <div className="relative w-40">
                <select
                  value={wildRound || ""}
                  onChange={(e) => setWildRound(Number(e.target.value))}
                  className="w-full p-2 bg-black border border-royal-gold rounded text-white text-center"
                >
                  <option value="" disabled>
                    Wildcard GW
                  </option>
                  {Array.from({ length: maxGW - minGW + 1  }, (_, i) => minGW + i).map(
                    (gw) => (
                      <option key={gw} value={gw}>
                        GW {gw}
                      </option>
                    )
                  )}
                </select>
                <button
                  onClick={() => {
                    setShowWildInput(false);
                    setWildRound("");
                  }}
                  className="absolute top-2 -right-8 p-1 text-red-500 bg-black"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={() => {
              setShowWildInput(true);
              if (minGW != null) setWildRound(minGW);
            }}
            className="w-40 p-2 bg-transparent border border-dashed border-royal-gold rounded text-royal-gold hover:bg-yellow-300 hover:text-black transition"
          >
            + Add Wildcard
          </button>
        )}

        {/* Free Hit */}
        {showfreehitInput ? (
          <>
            {minGW == null ? (
              <div className="w-40 p-2 text-center text-gray-400">Loading GWs…</div>
            ) : (
              <div className="relative w-40">
                <select
                  value={freehitROund || ""}
                  onChange={(e) => setfreehitROund(Number(e.target.value))}
                  className="w-full p-2 bg-black border border-royal-gold rounded text-white text-center"
                >
                  <option value="" disabled>
                    FreeHit GW
                  </option>
                  {Array.from({ length: maxGW - minGW + 1  }, (_, i) => minGW + i).map(
                    (gw) => (
                      <option key={gw} value={gw}>
                        GW {gw}
                      </option>
                    )
                  )}
                </select>
                <button
                  onClick={() => {
                    setshowfreehitInput(false);
                    setfreehitROund("");
                  }}
                  className="absolute top-2 -right-8 p-1 text-red-500 bg-black"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={() => {
              setshowfreehitInput(true);
              if (minGW != null) setfreehitROund(minGW);
            }}
            className="w-40 p-2 bg-transparent border border-dashed border-royal-gold rounded text-royal-gold hover:bg-yellow-300 hover:text-black transition"
          >
            + Add Free Hit
          </button>
        )}
        <div className="flex items-center gap-2 px-2 py-2 border border-royal-gold rounded">
  <span className="text-sm text-gray-300 select-none">Hits</span>

  <button
    type="button"
    aria-label="Decrease hits"
    onClick={() => setn_hits(Math.max(0, Number(n_hits || 0) - 1))}
    className="w-7 h-7 flex items-center justify-center rounded bg-black border border-royal-gold text-royal-gold hover:bg-yellow-300 hover:text-black transition"
  >
    −
  </button>

  <div
    className="w-10 text-center font-semibold"
    aria-live="polite"
  >
    {Number(n_hits || 0)}
  </div>

  <button
    type="button"
    aria-label="Increase hits"
    onClick={() => setn_hits(Number(n_hits || 0) + 1)}
    className="w-7 h-7 flex items-center justify-center rounded bg-black border border-royal-gold text-royal-gold hover:bg-yellow-300 hover:text-black transition"
  >
    +
  </button>
</div>

        <button
          onClick={() => {
            fetchTeam();
            sethas_changed(false);
          }}
          disabled={!has_changed}
          className={`font-semibold px-6 py-2 rounded transition ${
            has_changed
              ? "bg-royal-gold text-black hover:bg-yellow-300 cursor-pointer"
              : "bg-gray-600 text-gray-300 cursor-not-allowed"
          }`}
        >
          Optimize Team
        </button>
      </div>

      {/* Unwanted pills */}
      {bannedPlayersData.length > 0 && (
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-semibold text-white mb-2">Unwanted players</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {bannedPlayersData.map((player) => (
              <div
                key={player.Name}
                className="relative flex items-center bg-royal-red text-white px-1 py-1 rounded-full text-sm"
              >
                <img
                  src={player.photo}
                  alt={player.web_name}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src =
                      "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";
                  }}
                  className="w-7 h-7 rounded-full mr-1 object-cover"
                />
                <span>{player.web_name}</span>
                <button
                  onClick={() => removeBan(player.Name)}
                  className="absolute top-0 right-0 -mt-1 -mr-1 bg-black bg-opacity-50 rounded-full p-0.5"
                >
                  <X size={12} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header & total points */}
      {totalPredPoints != null && (
        <div className="text-center bg-black/70 backdrop-blur px-3 py-0 rounded-md text-center">
          <div className="text-[30px] uppercase tracking-wide text-gray-400 mb-1">
            Team for GW {minGW}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-gray-300">
            Total predicted points
          </div>
          <div className="text-royal-gold font-bold text-lg">
            {totalPredPoints.toFixed(2)}
            <p className="max-w-md text-center text-xs sm:text-sm leading-tight text-gray-600 dark:text-gray-300">
              Click a player to view stats, or add them to <span className="font-medium">Unwanted</span>
            </p>
          </div>
        </div>
      )}

      {/* Squad Pitch */}
      {data && (
        <div
          className="w-full max-w-[400px] aspect-[1/2] bg-no-repeat bg-cover bg-center border border-white rounded-lg px-2 py-1 relative"
          style={{ backgroundImage: `url(${pitch})` }}
        >
          <div className="flex flex-col justify-between h-[500px] pt-0 space-y-0 width-full">
            <PlayerRow
              players={starters.filter((p) => p.position === "GKP")}
              toggleBan={toggleBan}
              bannedList={bannedList}
              navigate={navigate}
            />
            <PlayerRow
              players={starters.filter((p) => p.position === "DEF")}
              toggleBan={toggleBan}
              bannedList={bannedList}
              navigate={navigate}
            />
            <PlayerRow
              players={starters.filter((p) => p.position === "MID")}
              toggleBan={toggleBan}
              bannedList={bannedList}
              navigate={navigate}
            />
            <PlayerRow
              players={starters.filter((p) => p.position === "FWD")}
              toggleBan={toggleBan}
              bannedList={bannedList}
              navigate={navigate}
            />
          </div>
          {bench.length > 0 && (
            <div className="absolute bottom-3 left-0 right-0">
              <PlayerRow
                players={bench}
                isBench
                toggleBan={toggleBan}
                bannedList={bannedList}
                navigate={navigate}
              />
            </div>
          )}
        </div>
      )}

      {/* Transfers under pitch */}
      {transfersWithFH.length > 0 && (
        <div className="w-full max-w-2xl">
          <h2 className="text-2xl font-bold text-center mb-3">Transfers</h2>

          {transfersWithFH.map((grp) => {
            const remainingIns = [...grp.in];

            const pairs = grp.out.map((outP) => {
              const i = remainingIns.findIndex((inP) => inP.position === outP.position);
              return i !== -1
                ? { outP, inP: remainingIns.splice(i, 1)[0] }
                : { outP, inP: null };
            });
            remainingIns.forEach((inP) => pairs.push({ outP: null, inP }));

            return (
              <div key={grp.GW} className="mb-6">
                <h3 className="text-lg font-semibold text-center mb-2">GW {grp.GW}</h3>

                {/* Free Hit banner row */}
                {grp.freehit && (
                  <div className="w-full text-center text-sm text-royal-gold italic mb-3">
                    Played Free Hit
                  </div>
                )}

                <div className="flex flex-wrap justify-center items-center gap-6">
                  {pairs.map(({ outP, inP }, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      {outP && (
                        <TransferCard
                          player={outP}
                          label="Out"
                          toggleBan={toggleBan}
                          bannedList={bannedList}
                          navigate={navigate}
                        />
                      )}
                      {outP && inP && <ArrowRight className="text-royal-gold" />}
                      {inP && (
                        <TransferCard
                          player={inP}
                          label="In"
                          toggleBan={toggleBan}
                          bannedList={bannedList}
                          navigate={navigate}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlayerRow({ players, isBench = false, toggleBan, bannedList, navigate }) {
  const fallback =
    "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";
  return (
    <div className="flex justify-center gap-2 px-2 overflow-x-auto text-center w-full ">
      {players.map((p) => (
        <div key={p.Name} className="relative">
          {p.Is_captain && (
            <div
              className="
                  absolute top-12 -left-2
                  bg-black text-white font-bold
                  text-xs rounded-full
                  w-5 h-5 flex items-center justify-center
                "
            >
              C
            </div>
          )}
          <img
            src={p.photo}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = fallback;
            }}
            className={`object-contain ${
              isBench
                ? "w-[45] h-[60px] sm:w-[55px] sm:h-[75px]"
                : "w-[60px] h-[80px] sm:w-[55px] sm:h-[75px]"
            }`}
            onClick={() =>
              navigate("/Player_Analytics/Individual", {
                state: { selectedPlayer: p.Name },
              })
            }
          />
          <button
            onClick={() => toggleBan(p.Name)}
            className="absolute top-0 -right-2 bg-black bg-opacity-50 p-1 rounded-full"
          >
            <X
              size={10}
              className={
                bannedList.includes(p.Name) ? "text-red-500" : "text-royal-gold"
              }
            />
          </button>
          <span
            className={`mt-1 text-center font-small text-xs sm:text-sm leading-tight ${
              isBench ? "text-black" : "text-white"
            }`}
          >
            {p.web_name}
          </span>
        </div>
      ))}
    </div>
  );
}

function TransferCard({ player, label, toggleBan, bannedList, navigate }) {
  const fallback = "https://cdn.nba.com/headshots/nba/latest/1040x760/1709.png";
  return (
    <div className="flex flex-col items-center text-white">
      <div className="relative">
        <img
          src={player.photo}
          alt={player.Name}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = fallback;
          }}
          className="w-12 h-16 rounded object-cover"
          onClick={() =>
            navigate("/Player_Analytics/Individual", {
              state: { selectedPlayer: player.Name },
            })
          }
        />
        {label === "In" && (
          <button
            onClick={() => toggleBan(player.Name)}
            className="absolute -top-2 -right-5  bg-black bg-opacity-50 p-1 rounded-full border-white mt-2"
          >
            <X
              size={16}
              className={
                bannedList.includes(player.Name) ? "text-red-500" : "text-royal-gold"
              }
            />
          </button>
        )}
      </div>
      <span className="text-xs mt-1">{player.web_name}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}
