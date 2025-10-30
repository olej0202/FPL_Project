// src/pages/OptimizeTeam.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import pitch from "./assets/pitch.png";
import { useMyteamData } from "./Contexts/MyTeamContext";

/**
 * Visual refresh: professional, consistent, accessible.
 * — keeps all original functionality
 * — improves spacing, alignment, and readability
 * — fixes a couple of minor className typos
 */
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
    setn_hits,
  } = useMyteamData();

  const navigate = useNavigate();

  // UI state
  const [showBbInput, setShowBbInput] = useState(!!bbRound);
  const [showWildInput, setShowWildInput] = useState(!!wildRound);
  const [showfreehitInput, setshowfreehitInput] = useState(!!freehitROund);

  // Loading progress animation
  const [loadingPhase, setLoadingPhase] = useState("idle");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    sethas_changed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, bbRound, wildRound, bannedList, freehitROund, n_hits]);

  useEffect(() => {
    if (loading) {
      setLoadingPhase("fetch");
      setProgress(0);

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
          // gentle drift 40 → 98 while still loading
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

  // --- Compute GWs and split squad ---
  let minGW = 1,
    maxGW = 38,
    starters = [],
    bench = [],
    transfers = [],
    gwData = [];

  if (data) {
    const gws = data.map((p) => Number(p.GW)).filter((n) => !isNaN(n));
    if (gws.length) {
      minGW = Math.min(...gws);
      maxGW = Math.min(38, minGW + 5);
    }
    gwData = data.filter((p) => Number(p.GW) === minGW);
    starters = gwData.filter((p) => p.status === "playing");
    bench = gwData.filter((p) => p.status === "benched");

    // group transfers by GW
    const moves = data.filter((p) => ["transferred_in", "transferred_out"].includes(p.status));
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
      const asNum = objRow.objective != null ? Number(objRow.objective) : Number(objRow.status);
      totalPredPoints = Number.isFinite(asNum) ? asNum : null;
    }
  }

  // --- Insert/mark Free Hit banner in the correct GW order ---
  const toNum = (v) => Number(v);
  let transfersWithFH = transfers;
  if (data && Number.isFinite(minGW) && Number.isFinite(maxGW)) {
    const fhGW = Number(freehitROund);
    const fhActive = Number.isFinite(fhGW) && fhGW >= minGW - 1 && fhGW <= maxGW;

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

  // Loading overlay (kept functional, restyled)
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 shadow-2xl">
          <div className="mb-2 text-center text-sm text-neutral-300">
            {loadingPhase === "fetch" ? "Fetching team…" : "Optimizing team…"}
          </div>
          <div className="h-2 w-full rounded bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-royal-gold transition-[width] duration-200 ease-out"
              style={{ width: `${progress}%` }}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              role="progressbar"
            />
          </div>
          <div className="mt-3 text-center text-xs text-neutral-400 animate-pulse">This can take a moment…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Optimize My Team</h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">Set your chips, adjust hits, and Optimize your team</p>
          </div>
          <button
            onClick={() => {
              fetchTeam();
              sethas_changed(false);
            }}
            disabled={!has_changed}
            className={`inline-flex items-center gap-2 font-semibold px-4 py-2 rounded-lg transition shadow-sm border
              ${has_changed ? "bg-royal-gold text-black hover:bg-yellow-300 border-yellow-400" : "bg-neutral-800 text-neutral-400 border-neutral-700 cursor-not-allowed"}`}
            aria-disabled={!has_changed}
          >
            <span>Optimize Team</span>
          </button>
        </header>

        {/* Controls Card */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Team ID */}
            <div className="flex flex-col gap-1">
              <label htmlFor="team-id" className="text-xs uppercase tracking-wide text-neutral-300">Team ID</label>
              <input
                id="team-id"
                type="number"
                inputMode="numeric"
                placeholder="Required"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-white/10 bg-black/60 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-royal-gold/60"
              />
            </div>

            {/* Bench Boost */}
            <ChipSelect
              label="Bench Boost GW"
              show={showBbInput}
              onShow={() => {
                setShowBbInput(true);
                if (minGW != null) setBbRound(minGW);
              }}
              onHide={() => {
                setShowBbInput(false);
                setBbRound("");
              }}
              value={bbRound}
              onChange={(v) => setBbRound(Number(v))}
              minGW={minGW}
              maxGW={maxGW}
              addLabel="Add Bench Boost"
            />

            {/* Wildcard */}
            <ChipSelect
              label="Wildcard GW"
              show={showWildInput}
              onShow={() => {
                setShowWildInput(true);
                if (minGW != null) setWildRound(minGW);
              }}
              onHide={() => {
                setShowWildInput(false);
                setWildRound("");
              }}
              value={wildRound}
              onChange={(v) => setWildRound(Number(v))}
              minGW={minGW}
              maxGW={maxGW}
              addLabel="Add Wildcard"
            />

            {/* Free Hit */}
            <ChipSelect
              label="Free Hit GW"
              show={showfreehitInput}
              onShow={() => {
                setshowfreehitInput(true);
                if (minGW != null) setfreehitROund(minGW);
              }}
              onHide={() => {
                setshowfreehitInput(false);
                setfreehitROund("");
              }}
              value={freehitROund}
              onChange={(v) => setfreehitROund(Number(v))}
              minGW={minGW}
              maxGW={maxGW}
              addLabel="Add Free Hit"
            />

            {/* Hits counter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-neutral-300">Hits</label>
              <div className="h-10 bg-black/60 border border-white/10 rounded-md flex items-center justify-between px-2">
                <IconButton
                  ariaLabel="Decrease hits"
                  onClick={() => setn_hits(Math.max(0, Number(n_hits || 0) - 1))}
                  label="−"
                />
                <div className="flex flex-col items-center leading-none select-none">
                  <span className="text-[10px] uppercase tracking-wide text-neutral-400">Count</span>
                  <span className="text-sm font-semibold">{Number(n_hits || 0)}</span>
                </div>
                <IconButton ariaLabel="Increase hits" onClick={() => setn_hits(Number(n_hits || 0) + 1)} label="+" />
              </div>
            </div>
          </div>
        </section>

        {/* Unwanted players */}
        {bannedPlayersData.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-2">Unwanted players</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {bannedPlayersData.map((player) => (
                <div key={player.Name} className="relative flex items-center gap-2 bg-rose-600/20 border border-rose-500/30 text-rose-100 px-2 py-1 rounded-full text-sm hover:bg-rose-600/30 transition">
                  <img
                    src={player.photo}
                    alt={player.web_name}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src =
                        "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";
                    }}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                  <span className="truncate max-w-[8rem]">{player.web_name}</span>
                  <button
                    onClick={() => removeBan(player.Name)}
                    className="absolute -top-1 -right-1 bg-black/60 rounded-full p-0.5 hover:bg-black/80"
                    aria-label={`Remove ${player.web_name} from unwanted`}
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Header & total points */}
        {totalPredPoints != null && (
          <section className="mb-8 text-center">
            <div className="inline-flex flex-col items-center rounded-xl border border-white/10 bg-white/5 backdrop-blur px-4 py-3">
              <div className="text-sm uppercase tracking-wide text-neutral-400">Team for GW {minGW}</div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-400">Total predicted points</div>
              <div className="text-royal-gold font-bold text-xl">{totalPredPoints.toFixed(2)}</div>
              <p className="max-w-md text-center text-xs leading-tight text-neutral-400 mt-1">
                Click a player to view stats, or add them to <span className="font-medium">Unwanted</span>
              </p>
            </div>
          </section>
        )}

        {/* Squad Pitch */}
        {data && (
          <section className="mb-8 ">
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
                <div className="absolute bottom-4 left-0 right-0">
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
          </section>
        )}


        {/* Transfers */}
        {transfersWithFH.length > 0 && (
          <section className="mb-4">
            <h2 className="text-2xl font-bold text-center mb-4">Transfers</h2>
            <div className="space-y-6">
              {transfersWithFH.map((grp) => {
                const remainingIns = [...grp.in];
                const pairs = grp.out.map((outP) => {
                  const i = remainingIns.findIndex((inP) => inP.position === outP.position);
                  return i !== -1 ? { outP, inP: remainingIns.splice(i, 1)[0] } : { outP, inP: null };
                });
                remainingIns.forEach((inP) => pairs.push({ outP: null, inP }));

                return (
                  <div key={grp.GW} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-4">
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <div className="text-sm font-medium">GW {grp.GW}</div>
                      {grp.freehit && (
                        <span className="text-xs px-2 py-1 rounded-full border border-royal-gold/50 text-royal-gold/90">Played Free Hit</span>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-center items-center gap-6">
                      {pairs.map(({ outP, inP }, idx) => (
                        <div key={idx} className="flex items-center gap-2">
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
          </section>
        )}
      </div>
    </div>
  );
}

/** Controls helper components **/
function ChipSelect({ label, show, onShow, onHide, value, onChange, minGW, maxGW, addLabel }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs uppercase tracking-wide text-neutral-300">{label}</label>

      {show ? (
        <div className="relative">
          <select
  value={value || ""}
  onChange={(e) => onChange(e.target.value)}
  style={{ colorScheme: "dark" }}               // <- key line
  className="
    w-full h-10 pl-3 pr-9 rounded-md
    border border-white/10
    bg-black/70 text-neutral-100 text-sm
    outline-none focus:outline-none
    focus:ring-0 focus-visible:ring-2 focus-visible:ring-royal-gold/60
  "
>
  <option value="" disabled className="text-neutral-400">{label}</option>
  {Array.from({ length: maxGW - minGW + 1 }, (_, i) => minGW + i).map((gw) => (
    <option key={gw} value={gw}>GW {gw}</option>
  ))}
</select>


          <button
            onClick={onHide}
            className="
              absolute inset-y-0 right-0 px-3 flex items-center
              text-rose-400 hover:text-rose-300
              outline-none focus:outline-none focus:ring-0
            "
            aria-label={`Clear ${label}`}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={onShow}
          type="button"
          className="
            h-10 w-full inline-flex items-center justify-center rounded-md
            border border-dashed border-royal-gold/40
            bg-royal-gold/10 text-royal-gold
            text-sm transition
            hover:bg-royal-gold hover:text-black
            outline-none focus:outline-none focus:ring-0
            focus-visible:ring-2 focus-visible:ring-royal-gold/60
            hover:border-none
          "
        >
          + {addLabel}
        </button>
      )}
    </div>
  );
}


function IconButton({ ariaLabel, onClick, label }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-royal-gold/60 text-royal-gold/90 bg-black/60 hover:bg-royal-gold hover:text-black transition leading-none"
    >
      {label}
    </button>
  );
}

/** Player row and cards **/
function PlayerRow({ players, isBench = false, toggleBan, bannedList, navigate }) {
  const fallback =
    "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";
  return (
    <div className="flex justify-center gap-2 px-3 overflow-x-auto text-center w-full">
      {players.map((p) => (
        <div key={p.Name} className="relative">
          {p.Is_captain && (
            <div className="absolute top-5 -left-2 bg-black/80 text-white font-bold text-xs rounded-full w-5 h-5 flex items-center justify-center shadow">C</div>
          )}
          <img
            src={p.photo}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = fallback;
            }}
            className={`${isBench ? "w-[50px] h-[68px] sm:w-[56px] sm:h-[76px]" : "w-[60px] h-[84px] sm:w-[62px] sm:h-[86px]"} object-contain drop-shadow`}
            onClick={() =>
              navigate("/Player_Analytics/Individual", {
                state: { selectedPlayer: p.Name },
              })
            }
            alt={p.web_name}
            role="button"
          />
          <button
            onClick={() => toggleBan(p.Name)}
            className="absolute top-1 -right-2 bg-black/70 p-1 rounded-full hover:bg-black/90"
            aria-label={`Toggle unwanted for ${p.web_name}`}
          >
            <X size={12} className={bannedList.includes(p.Name) ? "text-rose-500" : "text-royal-gold"} />
          </button>
          <div className={`${isBench ? " text-black/95" : " text-white/95"} mt-1 text-[11px] sm:text-xs leading-tight max-w-[70px] truncate`}>{p.web_name}</div>
          
        </div>
      ))}
    </div>
  );
}

function TransferCard({ player, label, toggleBan, bannedList, navigate }) {
  const fallback = "https://cdn.nba.com/headshots/nba/latest/1040x760/1709.png";
  return (
    <div className="flex flex-col items-center text-neutral-100">
      <div className="relative">
        <img
          src={player.photo}
          alt={player.Name}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = fallback;
          }}
          className="w-12 h-16 rounded object-cover border border-white/10 shadow"
          onClick={() =>
            navigate("/Player_Analytics/Individual", {
              state: { selectedPlayer: player.Name },
            })
          }
          role="button"
        />
        {label === "In" && (
          <button
            onClick={() => toggleBan(player.Name)}
            className="absolute -top-2 -right-4 bg-black/70 p-1 rounded-full hover:bg-black/90"
            aria-label={`Toggle unwanted for ${player.web_name}`}
          >
            <X size={14} className={bannedList.includes(player.Name) ? "text-rose-500" : "text-royal-gold"} />
          </button>
        )}
      </div>
      <span className="text-xs mt-1 max-w-[80px] truncate text-center">{player.web_name}</span>
      <span className="text-[11px] text-neutral-400">{label}</span>
    </div>
  );
}
