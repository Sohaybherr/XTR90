function toMarketValueNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function classifyMarketValue(value, type = "player") {
  const amount = toMarketValueNumber(value);

  if (!amount) return "unknown";

  const thresholds = {
    player: [
      [100000000, "world_class"],
      [50000000, "elite"],
      [20000000, "high"],
      [5000000, "solid"],
    ],
    team: [
      [1000000000, "world_class"],
      [500000000, "elite"],
      [200000000, "high"],
      [50000000, "solid"],
    ],
    competition: [
      [8000000000, "world_class"],
      [3000000000, "elite"],
      [1000000000, "high"],
      [250000000, "solid"],
    ],
  };

  const selected = thresholds[type] || thresholds.player;
  const match = selected.find(([minimum]) => amount >= minimum);
  return match ? match[1] : "low";
}

function formatMarketValue(value) {
  const amount = toMarketValueNumber(value);
  if (!amount) return null;

  if (amount >= 1000000000) {
    return `€${(amount / 1000000000).toFixed(amount >= 10000000000 ? 0 : 1)}bn`;
  }

  if (amount >= 1000000) {
    return `€${(amount / 1000000).toFixed(amount >= 100000000 ? 0 : 1)}m`;
  }

  if (amount >= 1000) {
    return `€${Math.round(amount / 1000)}k`;
  }

  return `€${amount}`;
}

function marketValueDto(value, type) {
  const amount = toMarketValueNumber(value);

  return {
    marketValue: amount,
    marketValueLabel: formatMarketValue(amount),
    marketClass: classifyMarketValue(amount, type),
  };
}

module.exports = {
  classifyMarketValue,
  formatMarketValue,
  marketValueDto,
  toMarketValueNumber,
};
