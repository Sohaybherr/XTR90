function validationError(message, details) {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  return error;
}

function parsePositiveInt(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw validationError(`${fieldName} must be a positive integer`, { [fieldName]: value });
  }
  return parsed;
}

function parseOptionalPositiveInt(value, fieldName) {
  if (value === undefined || value === null || value === "") return undefined;
  return parsePositiveInt(value, fieldName);
}

function parsePage(query) {
  const page = parseOptionalPositiveInt(query.page, "page") || 1;
  const limit = parseOptionalPositiveInt(query.limit, "limit") || 25;

  if (limit > 100) {
    throw validationError("limit must be less than or equal to 100", { limit: query.limit, max: 100 });
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}

function parseDate(value, fieldName) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw validationError(`${fieldName} must be a valid YYYY-MM-DD date`, { [fieldName]: value });
  }
  return String(value);
}

function parseOptionalText(value, fieldName, max = 100) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (text.length > max) {
    throw validationError(`${fieldName} must be ${max} characters or fewer`, { [fieldName]: value, max });
  }
  return text;
}

function parseSeason(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const season = String(value).trim();
  if (!/^\d{4}$|^\d{2}\/\d{2}$/.test(season)) {
    throw validationError("season must be a year like 2026 or provider season like 25/26", { season: value });
  }
  return season;
}

function latest(query) {
  return {
    pagination: parsePage(query),
    filters: {
      leagueId: parseOptionalPositiveInt(query.leagueId, "leagueId"),
      leagueApiId: parseOptionalPositiveInt(query.leagueApiId, "leagueApiId"),
      season: parseSeason(query.season),
      dateFrom: parseDate(query.dateFrom, "dateFrom"),
      dateTo: parseDate(query.dateTo, "dateTo"),
      topFiveOnly: query.topFiveOnly === undefined || query.topFiveOnly === "true" || query.topFiveOnly === true
    }
  };
}

function team(params) {
  return {
    teamId: parsePositiveInt(params.teamId, "teamId")
  };
}

function player(params) {
  return {
    playerId: parsePositiveInt(params.playerId, "playerId")
  };
}

function search(query) {
  return {
    pagination: parsePage(query),
    filters: {
      player: parseOptionalText(query.player, "player"),
      team: parseOptionalText(query.team, "team"),
      season: parseSeason(query.season),
      league: parseOptionalText(query.league, "league"),
      nationality: parseOptionalText(query.nationality, "nationality"),
      position: parseOptionalText(query.position, "position")
    }
  };
}

function summary(query) {
  return {
    filters: {
      leagueId: parseOptionalPositiveInt(query.leagueId, "leagueId"),
      leagueApiId: parseOptionalPositiveInt(query.leagueApiId, "leagueApiId"),
      season: parseSeason(query.season),
      dateFrom: parseDate(query.dateFrom, "dateFrom"),
      dateTo: parseDate(query.dateTo, "dateTo"),
      topFiveOnly: query.topFiveOnly === undefined || query.topFiveOnly === "true" || query.topFiveOnly === true
    }
  };
}

function sync(query) {
  return {
    playerId: parseOptionalPositiveInt(query.playerId, "playerId"),
    teamId: parseOptionalPositiveInt(query.teamId, "teamId"),
    limit: parseOptionalPositiveInt(query.limit, "limit"),
    force: query.force === "true" || query.force === true
  };
}

module.exports = {
  latest,
  player,
  search,
  summary,
  sync,
  team,
  validationError
};
