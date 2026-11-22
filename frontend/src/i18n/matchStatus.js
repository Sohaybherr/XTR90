export const MATCH_STATUS_KEYS = {
  NS: 'match.status.NS',
  '1H': 'match.status.1H',
  HT: 'match.status.HT',
  '2H': 'match.status.2H',
  ET: 'match.status.ET',
  BT: 'match.status.BT',
  P: 'match.status.P',
  LIVE: 'match.status.LIVE',
  FT: 'match.status.FT',
  AET: 'match.status.AET',
  PEN: 'match.status.PEN',
  PST: 'match.status.PST',
  CANC: 'match.status.CANC',
  ABD: 'match.status.ABD',
  TBD: 'match.status.TBD',
}

export function matchStatusKey(statusCode) {
  const code = String(statusCode || '').toUpperCase().replace("'", '')
  return MATCH_STATUS_KEYS[code] || ''
}
