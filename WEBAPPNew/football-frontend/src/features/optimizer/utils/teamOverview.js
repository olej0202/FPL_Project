import teamShort from "../../../utils/team_short.js";

export const PALETTE = {
  red: "#f8fafc",
  gold: "#5f8f7b",
  goldSoft: "#8fbca9",
  black: "#e2e8f0",
  beige: "#1e293b",
  card: "rgba(255,255,255,0.95)",
  cardSoft: "rgba(241,245,249,0.94)",
  border: "rgba(148,163,184,0.35)",
  muted: "#64748b",
};

export const pageBg = {
  background: `radial-gradient(circle at top, ${PALETTE.red} 0%, ${PALETTE.black} 58%, #cbd5e1 100%)`,
  color: PALETTE.beige,
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export const glassCard = {
  border: `1px solid ${PALETTE.border}`,
  background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(241,245,249,0.95))",
  boxShadow: "0 14px 30px rgba(15,23,42,0.1)",
  backdropFilter: "blur(12px)",
};

export const softCard = {
  border: `1px solid ${PALETTE.border}`,
  background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
  boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
};

export const inputStyle = {
  border: `1px solid ${PALETTE.border}`,
  backgroundColor: "rgba(255,255,255,0.98)",
  color: PALETTE.beige,
};

export const normalizeTeamKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const getTeamShort = (teamNameOrCode) => {
  if (!teamNameOrCode) return null;

  const raw = String(teamNameOrCode).trim();
  if (/^[A-Za-z]{2,4}$/.test(raw)) return raw.toUpperCase();

  if (teamShort?.[raw]) return String(teamShort[raw]).toUpperCase();

  const target = normalizeTeamKey(raw);
  const key = Object.keys(teamShort || {}).find(
    (k) => normalizeTeamKey(k) === target
  );

  if (key) return String(teamShort[key]).toUpperCase();
  return null;
};

export const formatOpponent = (opponentValue) => {
  if (!opponentValue) {
    return { opp1: "N/A", opp2: null, display: "N/A" };
  }

  const partsFromArray = Array.isArray(opponentValue) ? opponentValue : null;

  const partsFromString =
    partsFromArray ||
    String(opponentValue)
      .split(/\s*(\/|&|,|;|\band\b|\bAND\b)\s*/g)
      .filter((x) => x && !/^(\/|&|,|;|and|AND)$/i.test(x))
      .map((x) => x.trim())
      .filter(Boolean);

  const oppA = partsFromString?.[0] ?? null;
  const oppB = partsFromString?.[1] ?? null;

  const shortA = getTeamShort(oppA) || "N/A";
  const shortB = oppB ? getTeamShort(oppB) : null;

  return {
    opp1: shortA,
    opp2: shortB || null,
    display: shortB ? `${shortA}/${shortB}` : shortA,
  };
};

export const toFiniteNumber = (...values) => {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export const getTeamNameFromStrengthRow = (row) => {
  const raw = row?.name ?? row?.team_name ?? row?.Team ?? row?.team ?? row?.full_name;
  return raw ? String(raw).trim() : null;
};

export const getRawTeamStrength = (row) => {
  const attack = toFiniteNumber(
    row?.XG_avg,
    row?.XG,
    row?.xg,
    row?.XGH,
    row?.attack_strength
  );
  const defense = toFiniteNumber(
    row?.XGC_avg,
    row?.XGC,
    row?.xgc,
    row?.XGCH,
    row?.defence_strength,
    row?.defense_strength
  );

  if (!Number.isFinite(attack) && !Number.isFinite(defense)) return null;
  const a = Number.isFinite(attack) ? attack : 1.25;
  const d = Number.isFinite(defense) ? defense : 1.25;
  return a - 0.45 * d;
};

export const buildOpponentStrengthLookup = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return new Map();

  const grouped = new Map();

  rows.forEach((row) => {
    const teamName = getTeamNameFromStrengthRow(row);
    const rawStrength = getRawTeamStrength(row);
    if (!teamName || !Number.isFinite(rawStrength)) return;

    const key = normalizeTeamKey(teamName);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { teamName, sum: rawStrength, count: 1 });
      return;
    }

    grouped.set(key, {
      teamName: current.teamName,
      sum: current.sum + rawStrength,
      count: current.count + 1,
    });
  });

  if (!grouped.size) return new Map();

  const averages = Array.from(grouped.values()).map((v) => ({
    teamName: v.teamName,
    strength: v.sum / Math.max(1, v.count),
  }));

  const values = averages.map((v) => v.strength);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-6, max - min);

  const lookup = new Map();
  averages.forEach(({ teamName, strength }) => {
    const normalized = (strength - min) / span; // 0 = weakest, 1 = strongest
    const nameKey = normalizeTeamKey(teamName);
    lookup.set(nameKey, normalized);

    const shortCode = getTeamShort(teamName);
    if (shortCode) lookup.set(normalizeTeamKey(shortCode), normalized);
  });

  return lookup;
};

export const opponentStrengthTone = (strength) => {
  if (!Number.isFinite(strength)) {
    return {
      label: "Unknown",
      badgeBg: "rgba(248,250,252,0.96)",
      badgeBorder: "rgba(148,163,184,0.45)",
      badgeText: "#334155",
      metaText: "#64748b",
    };
  }

  if (strength >= 0.67) {
    return {
      label: "Hard",
      badgeBg: "rgba(254,242,242,0.96)",
      badgeBorder: "rgba(248,113,113,0.5)",
      badgeText: "#b91c1c",
      metaText: "#991b1b",
    };
  }

  if (strength >= 0.4) {
    return {
      label: "Medium",
      badgeBg: "rgba(255,251,235,0.96)",
      badgeBorder: "rgba(245,158,11,0.45)",
      badgeText: "#92400e",
      metaText: "#a16207",
    };
  }

  return {
    label: "Favorable",
    badgeBg: "rgba(236,253,245,0.96)",
    badgeBorder: "rgba(52,211,153,0.5)",
    badgeText: "#166534",
    metaText: "#047857",
  };
};

export const splitOpponentParts = (value) =>
  String(value || "")
    .split(/\s*(\/|&|,|;|\band\b|\bAND\b)\s*/g)
    .filter((x) => x && !/^(\/|&|,|;|and|AND)$/i.test(x))
    .map((x) => x.trim())
    .filter(Boolean);

export const lookupStrengthForOpponent = (lookup, opponentValue) => {
  if (!(lookup instanceof Map) || lookup.size === 0 || !opponentValue) return null;

  const candidates = splitOpponentParts(opponentValue);
  if (!candidates.length) candidates.push(String(opponentValue));

  const scores = candidates
    .map((cand) => {
      const key = normalizeTeamKey(cand);
      if (lookup.has(key)) return lookup.get(key);

      const short = getTeamShort(cand);
      if (short) {
        const shortKey = normalizeTeamKey(short);
        if (lookup.has(shortKey)) return lookup.get(shortKey);
      }
      return null;
    })
    .filter((v) => Number.isFinite(v));

  if (!scores.length) return null;
  return Math.max(...scores);
};

export function computeDefaultStartersIndices(squad, gw, playersData) {
  if (!Array.isArray(squad) || squad.length === 0) return [];

  const metadata = squad.map((player, idx) => {
    const prediction = playersData.find(
      (p) => p.name === player.name && Number(p.GW) === Number(gw)
    );
    const pts = prediction?.Points_prediction
      ? Number(prediction.Points_prediction)
      : 0;

    return {
      idx,
      pos: player.position,
      pts,
    };
  });

  const byPos = { GKP: [], DEF: [], MID: [], FWD: [] };
  metadata.forEach((m) => {
    if (byPos[m.pos]) byPos[m.pos].push(m);
  });

  Object.values(byPos).forEach((arr) => arr.sort((a, b) => b.pts - a.pts));

  const chosen = new Set();
  const maxStarters = Math.min(11, squad.length);

  const pickFrom = (arr, n) => {
    for (let i = 0; i < arr.length && chosen.size < maxStarters && n > 0; i++) {
      if (!chosen.has(arr[i].idx)) {
        chosen.add(arr[i].idx);
        n--;
      }
    }
  };

  pickFrom(byPos.GKP, 1);
  pickFrom(byPos.DEF, 3);
  pickFrom(byPos.MID, 2);
  pickFrom(byPos.FWD, 1);

  let gkp = 0;
  let _def = 0;
  let _mid = 0;
  let _fwd = 0;

  chosen.forEach((idx) => {
    const pos = metadata.find((m) => m.idx === idx)?.pos;
    if (pos === "GKP") gkp++;
    else if (pos === "DEF") _def++;
    else if (pos === "MID") _mid++;
    else if (pos === "FWD") _fwd++;
  });

  const remaining = metadata
    .filter((m) => !chosen.has(m.idx))
    .sort((a, b) => b.pts - a.pts);

  for (const m of remaining) {
    if (chosen.size >= maxStarters) break;
    if (m.pos === "GKP" && gkp >= 1) continue;

    chosen.add(m.idx);
    if (m.pos === "GKP") gkp++;
    else if (m.pos === "DEF") _def++;
    else if (m.pos === "MID") _mid++;
    else if (m.pos === "FWD") _fwd++;
  }

  return Array.from(chosen);
}
