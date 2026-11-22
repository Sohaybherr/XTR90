const service = require("./rankings.service");

function parseType(value) {
  if (!value) return undefined;
  const type = String(value);
  if (!["fifa_men", "uefa_club"].includes(type)) {
    const error = new Error("type must be fifa_men or uefa_club");
    error.statusCode = 400;
    throw error;
  }
  return type;
}

async function getRankings(req, res) {
  try {
    const result = await service.listRankings({ type: parseType(req.query.type) });
    res.json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error("Error fetching rankings:", error);
    }
    res.status(statusCode).json({ error: error.message || "Internal Server Error" });
  }
}

module.exports = {
  getRankings
};
