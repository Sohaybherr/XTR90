/**
 * @typedef {"home" | "away" | "all"} VenueFilter
 */

/**
 * @typedef {Object} TeamMatchRow
 * @property {number} id
 * @property {number} home_team_id
 * @property {number} away_team_id
 * @property {number} home_goals
 * @property {number} away_goals
 * @property {string} status_short
 * @property {string | Date} kickoff_at
 * @property {string} competition_name
 * @property {string} home_team_name
 * @property {string} away_team_name
 */

/**
 * @typedef {Object} TeamRecord
 * @property {number} played
 * @property {number} wins
 * @property {number} draws
 * @property {number} losses
 * @property {number} goalsFor
 * @property {number} goalsAgainst
 * @property {number} goalDifference
 * @property {number} points
 * @property {number} pointsPerGame
 * @property {number} winRate
 * @property {number} cleanSheets
 * @property {number} cleanSheetRate
 * @property {number} bothTeamsScored
 * @property {number} bothTeamsScoredRate
 * @property {number} over25
 * @property {number} over25Rate
 * @property {string[]} form
 */

module.exports = {};
