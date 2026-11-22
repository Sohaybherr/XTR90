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

function parseLast(value, defaultValue = 5, max = 50) {
  const parsed = parseOptionalPositiveInt(value, "last") || defaultValue;
  if (parsed > max) {
    throw validationError(`last must be less than or equal to ${max}`, { last: value, max });
  }
  return parsed;
}

function parseVenue(value) {
  if (value === undefined || value === null || value === "") return "all";
  if (!["home", "away", "all"].includes(value)) {
    throw validationError("venue must be one of home, away, all", { venue: value });
  }
  return value;
}

function optionalFilters(query) {
  return {
    competitionId: parseOptionalPositiveInt(query.competitionId, "competitionId"),
    seasonId: parseOptionalPositiveInt(query.seasonId, "seasonId")
  };
}

function teamForm(params, query) {
  return {
    teamId: parsePositiveInt(params.teamId, "teamId"),
    last: parseLast(query.last, 5, 30),
    venue: parseVenue(query.venue),
    ...optionalFilters(query)
  };
}

function teamSummary(params, query) {
  return {
    teamId: parsePositiveInt(params.teamId, "teamId"),
    venue: parseVenue(query.venue),
    ...optionalFilters(query)
  };
}

function headToHead(query) {
  const teamAId = parsePositiveInt(query.teamAId, "teamAId");
  const teamBId = parsePositiveInt(query.teamBId, "teamBId");
  if (teamAId === teamBId) {
    throw validationError("teamAId and teamBId must be different", { teamAId, teamBId });
  }

  return {
    teamAId,
    teamBId,
    last: parseLast(query.last, 10, 50),
    competitionId: parseOptionalPositiveInt(query.competitionId, "competitionId")
  };
}

function playerSummary(params, query) {
  return {
    playerId: parsePositiveInt(params.playerId, "playerId"),
    last: parseOptionalPositiveInt(query.last, "last"),
    ...optionalFilters(query)
  };
}

function competitionTable(params, query) {
  return {
    competitionId: parsePositiveInt(params.competitionId, "competitionId"),
    seasonId: parseOptionalPositiveInt(query.seasonId, "seasonId")
  };
}

module.exports = {
  competitionTable,
  headToHead,
  playerSummary,
  teamForm,
  teamSummary,
  validationError
};
