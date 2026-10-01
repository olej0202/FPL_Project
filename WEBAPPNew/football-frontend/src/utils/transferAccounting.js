// Keep the normalized preference compatible with saved trees and API requests.
export const transferPenaltyPoints = (weight = 0.5) => 2.4 * weight;

export function accountTransfers(weeks, initialFreeTransfers, initialBank) {
  const result = {};
  let available = Math.max(0, Math.min(5, Number(initialFreeTransfers) || 0));
  let bank = Number(initialBank) || 0;
  weeks.forEach(({ gw, chip, count, spend }) => {
    const chipWeek = chip === 'wildcard' || chip === 'freehit';
    const used = chipWeek ? 0 : count;
    const hits = chipWeek ? 0 : Math.max(0, used - available);
    const after = Math.max(0, available - (chipWeek ? 1 : used));
    const displayedBank = bank - spend;
    result[String(gw)] = { available, used, hits, after, bank: displayedBank };
    if (chip !== 'freehit') bank = displayedBank;
    available = Math.min(5, after + 1);
  });
  return result;
}
