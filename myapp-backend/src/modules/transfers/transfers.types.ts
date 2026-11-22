/**
 * @typedef {"loan" | "permanent" | "free" | "unknown"} TransferType
 *
 * @typedef {Object} Pagination
 * @property {number} page
 * @property {number} limit
 * @property {number} offset
 *
 * @typedef {Object} TransferFilters
 * @property {number=} leagueId
 * @property {number=} leagueApiId
 * @property {string|number=} season
 * @property {string=} dateFrom
 * @property {string=} dateTo
 * @property {boolean=} topFiveOnly
 * @property {string=} player
 * @property {string=} team
 * @property {string=} league
 * @property {string=} nationality
 * @property {string=} position
 *
 * @typedef {Object} NormalizedTransfer
 * @property {number} playerId
 * @property {number|null} oldTeamId
 * @property {number|null} newTeamId
 * @property {TransferType} transferType
 * @property {number} transferFee
 * @property {string|null} transferDate
 * @property {string|null} providerTransferId
 * @property {string|null} providerSeason
 * @property {Object|null} oldTeamProvider
 * @property {Object|null} newTeamProvider
 *
 * @typedef {Object} SyncTransfersOptions
 * @property {number=} playerId
 * @property {number=} limit
 * @property {boolean=} force
 */

module.exports = {};
