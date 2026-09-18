const MIN_MINUTES = 0;
const MAX_MINUTES = 90;

const POSITION_EVENT_BONUS = {
  GKP: { goal: 12.0, assist: 9.0, cs: 12.0 },
  DEF: { goal: 12.0, assist: 9.0, cs: 12.0 },
  MID: { goal: 18.0, assist: 9.0, cs: 0.0 },
  FWD: { goal: 24.0, assist: 9.0, cs: 0.0 },
};

const clamp01 = (value) => {
  const numeric = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : 0));
};

const firstFinite = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

const canonicalPosition = (value) => {
  const key = String(value || "").toUpperCase();
  if (key === "GK") return "GKP";
  if (key === "FOR") return "FWD";
  return key || "MID";
};

const poissonGc2PlusFromCs = (csProb) => {
  const safeCs = Math.max(1e-6, Math.min(0.999999, Number(csProb) || 0));
  const lambda = -Math.log(safeCs);
  return 1 - Math.exp(-lambda) * (1 + lambda);
};

export const calculatePlayerProjection = (
  playerRow,
  teamRow,
  cbi01Override = null
) => {
  if (!teamRow) {
    return {
      Goal_Scored: 0,
      Assists: 0,
      Bonus_Pred: 0,
      Save_Pred: 0,
      Points: 0,
      Avg_Minutes: 0,
      CBI_Predictions: 0,
      _CBI01_Raw: 0,
      _Breakdown: {
        base: 0,
        goal: 0,
        assist: 0,
        defcon: 0,
        cs: 0,
        bonus: 0,
        card: 0,
        gc: 0,
        total: 0,
      },
    };
  }

  const matchCount = Math.max(0, Number(teamRow.Matches) || 0);
  const avgMin = Math.max(
    MIN_MINUTES,
    Math.min(MAX_MINUTES, Number(playerRow.average_minutes) || 0)
  );

  const goalShare = Number(playerRow.Goal_share) || 0;
  const assistShare = Number(playerRow.Assist_share) || 0;
  const savePredRaw = Number(playerRow.Save_Pred) || 0;
  const penData = Number(playerRow.Pen_data) || 0;
  const oppGoalThreat = Number(playerRow.Pos_Goal_Threat) || 0;
  const oppAssistThreat = Number(playerRow.Pos_Assist_Threat) || 0;

  const positionKey = canonicalPosition(playerRow.position);
  const bonusWeights = POSITION_EVENT_BONUS[positionKey] || POSITION_EVENT_BONUS.MID;
  const bps = Number(playerRow.BPS) || 0;
  const goalFactor = Number(playerRow.Goal_factor) || 0;
  const assistFactor = Number(playerRow.Assist_factor) || 0;
  const csFactor = Number(playerRow.CS_factor) || 0;
  const cards = firstFinite(playerRow.Cards, playerRow.Card_pred, playerRow.card, 0);

  const xg = Number(teamRow.XG) || 0;
  const cs = Number(teamRow.CS) || 0;
  const minutesAdj = avgMin ? Math.min(1, avgMin / 80) : 0;
  const likelihoodOf60 = 1 / (1 + Math.exp(-(-3.045855 + 0.056203 * avgMin)));
  const likelihoodOf0 = 1 / (1 + Math.exp(-(-1.855427 + 0.056741 * avgMin)));

  const goalScored =
    ((goalShare * 0.9 + 0.1 * oppGoalThreat) * xg + penData * 0.5 * matchCount) *
    minutesAdj;
  const assists =
    ((assistShare * 0.9 + 0.1 * oppAssistThreat) * xg) * minutesAdj;

  const rawCbi01 = clamp01(
    firstFinite(playerRow.CBI_Predictions, playerRow.CBI_Percent, 0)
  );
  const cbi01 =
    (typeof cbi01Override === "number" && Number.isFinite(cbi01Override)
      ? clamp01(cbi01Override)
      : rawCbi01) * minutesAdj;

  const defconPointsTerm = cbi01 * minutesAdj * matchCount * 2;
  const savePred = savePredRaw * minutesAdj * matchCount;
  const groundPoints = (likelihoodOf0 + likelihoodOf60) * matchCount;
  const goalPoints = goalScored * goalFactor;
  const assistPoints = assists * assistFactor;
  const bonusCsBase = cs * likelihoodOf60;
  const csPoints = bonusCsBase * csFactor;
  const gc2PlusProb = poissonGc2PlusFromCs(cs);
  const gcPenaltyBonusBase =
    positionKey === "GKP" || positionKey === "DEF"
      ? -3 * gc2PlusProb * likelihoodOf60
      : 0;
  const bonusPoints =
    0.035 *
    (bps +
      goalScored * bonusWeights.goal +
      assists * bonusWeights.assist +
      bonusCsBase * bonusWeights.cs +
      gcPenaltyBonusBase);
  const cardPoints = -cards;
  const gcPenaltyPoints =
    positionKey === "GKP" || positionKey === "DEF"
      ? -gc2PlusProb * likelihoodOf60
      : 0;

  const points = Math.max(
    0,
    groundPoints +
      goalPoints +
      assistPoints +
      defconPointsTerm +
      csPoints +
      bonusPoints +
      cardPoints +
      gcPenaltyPoints
  );

  return {
    Goal_Scored: goalScored,
    Assists: assists,
    Bonus_Pred: bonusPoints,
    Save_Pred: savePred,
    Points: points,
    Avg_Minutes: avgMin * matchCount,
    CBI_Predictions: cbi01,
    _CBI01_Raw: rawCbi01,
    _Breakdown: {
      base: groundPoints,
      goal: goalPoints,
      assist: assistPoints,
      defcon: defconPointsTerm,
      cs: csPoints,
      bonus: bonusPoints,
      card: cardPoints,
      gc: gcPenaltyPoints,
      total: points,
    },
  };
};
