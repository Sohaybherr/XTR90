const pool = require("../../config/db");
const { toAssetPath } = require("../../utils/assets");

const HOME_CACHE_TTL_MS = Number(process.env.HOME_CACHE_TTL_MS || 15000);
const homeCache = new Map();

function getCountryFlag(country) {
  return toAssetPath(
    country.flag || (country.code ? `/assets/flags/flag_${String(country.code).toLowerCase()}.svg` : null)
  );
}

function isFriendlyCompetition(competition) {
  return /friendl/i.test(String(competition.name || ""));
}

function firstMatchTime(competition) {
  const date = new Date(competition?.matches?.[0]?.time);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function getOrCreateCountry(countriesMap, row) {
  const internationalCountryKey = "__international__";
  const friendlyCountryKey = "__friendly__";

  if (isFriendlyCompetition({ name: row.competition_name })) {
    if (!countriesMap.has(friendlyCountryKey)) {
      countriesMap.set(friendlyCountryKey, {
        id: friendlyCountryKey,
        name: "Friendly",
        code: null,
        flag: null,
        competitions: [],
      });
    }
    return countriesMap.get(friendlyCountryKey);
  }

  if (!row.country_id) {
    if (!countriesMap.has(internationalCountryKey)) {
      countriesMap.set(internationalCountryKey, {
        id: internationalCountryKey,
        name: "International",
        code: null,
        flag: null,
        competitions: [],
      });
    }
    return countriesMap.get(internationalCountryKey);
  }

  const key = String(row.country_id);
  if (!countriesMap.has(key)) {
    countriesMap.set(key, {
      id: row.country_id,
      name: row.country_name,
      code: row.country_code,
      flag: getCountryFlag({ flag: row.country_flag, code: row.country_code }),
      competitions: [],
    });
  }

  return countriesMap.get(key);
}

function matchDto(row) {
  return {
    id: row.id,
    apiId: row.api_id,
    competitionSeasonId: row.competition_season_id,
    seasonId: row.season_id,
    round: row.round,
    time: row.kickoff_at || row.match_date,
    status: row.status_short || row.status,
    statusShort: row.status_short || row.status,
    statusLong: row.status_long,
    elapsed: row.elapsed,
    extra: row.elapsed_extra,
    updatedAt: row.last_live_sync_at || row.updated_at || row.api_synced_at,
    score:
      row.home_goals == null && row.away_goals == null
        ? null
        : `${row.home_goals ?? row.home_score ?? "-"} - ${row.away_goals ?? row.away_score ?? "-"}`,
    homeTeam: row.home_team_id ? {
      id: row.home_team_id,
      name: row.home_team_name,
      logo: toAssetPath(row.home_team_logo),
    } : null,
    awayTeam: row.away_team_id ? {
      id: row.away_team_id,
      name: row.away_team_name,
      logo: toAssetPath(row.away_team_logo),
    } : null,
  };
}

function parseWindowDays(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 10);
}

async function getHome(req, res) {
  try {
    const daysBack = parseWindowDays(req.query.daysBack, 10);
    const daysForward = parseWindowDays(req.query.daysForward, 10);
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - daysBack);
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    endDate.setDate(endDate.getDate() + daysForward + 1);
    const cacheKey = `${daysBack}:${daysForward}`;
    const cached = homeCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      res.set("Cache-Control", "private, max-age=15");
      res.set("X-Home-Cache", "HIT");
      return res.json(cached.data);
    }

    const result = await pool.query(`
      SELECT
        m.id,
        m.api_id,
        m.competition_id,
        m.competition_season_id,
        m.season_id,
        m.round,
        m.kickoff_at,
        m.match_date,
        m.status,
        m.status_short,
        m.status_long,
        m.elapsed,
        m.elapsed_extra,
        m.last_live_sync_at,
        m.updated_at,
        m.api_synced_at,
        m.home_goals,
        m.away_goals,
        m.home_score,
        m.away_score,
        c.api_id AS competition_api_id,
        c.name AS competition_name,
        c.type AS competition_type,
        c.logo AS competition_logo,
        c.country_id,
        country.name AS country_name,
        country.code AS country_code,
        country.flag AS country_flag,
        ht.id AS home_team_id,
        ht.name AS home_team_name,
        ht.logo_path AS home_team_logo,
        at.id AS away_team_id,
        at.name AS away_team_name,
        at.logo_path AS away_team_logo
      FROM matches m
      JOIN competitions c ON c.id = m.competition_id
      LEFT JOIN countries country ON country.id = c.country_id
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      WHERE (
        (m.kickoff_at IS NOT NULL AND m.kickoff_at >= $1 AND m.kickoff_at < $2)
        OR (m.kickoff_at IS NULL AND m.match_date >= $1::date AND m.match_date < $2::date)
      )
      ORDER BY COALESCE(m.kickoff_at, m.match_date::timestamp), c.name, m.id
    `, [startDate, endDate]);

    const countriesMap = new Map();
    const competitionsMap = new Map();

    result.rows.forEach((row) => {
      const competitionKey = String(row.competition_id);
      let competition = competitionsMap.get(competitionKey);

      if (!competition) {
        competition = {
          id: row.competition_id,
          apiId: row.competition_api_id,
          name: row.competition_name,
          type: row.competition_type,
          logo: toAssetPath(row.competition_logo),
          matches: [],
        };
        competitionsMap.set(competitionKey, competition);
        getOrCreateCountry(countriesMap, row).competitions.push(competition);
      }

      competition.matches.push(matchDto(row));
    });

    const response = Array.from(countriesMap.values())
      .map((country) => ({
        ...country,
        competitions: country.competitions
          .map((competition) => ({
            ...competition,
            matches: competition.matches.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
          }))
          .sort((a, b) => firstMatchTime(a) - firstMatchTime(b)),
      }))
      .filter((country) => country.competitions.length > 0)
      .sort((a, b) => firstMatchTime(a.competitions[0]) - firstMatchTime(b.competitions[0]));

    homeCache.set(cacheKey, {
      data: response,
      expiresAt: Date.now() + HOME_CACHE_TTL_MS,
    });

    res.set("Cache-Control", "private, max-age=15");
    res.set("X-Home-Cache", "MISS");
    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

module.exports = {
  getHome,
};
