import { useEffect, useState } from 'react'
import { getLiveMatches } from '../api/matches'
import { loadSocketClient } from '../utils/socketClient'

const LIVE_STATUSES = new Set(['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'])
const LIVE_REFRESH_MS = 10000

function buildTimerLabel(status) {
  const elapsed = status?.elapsed
  const extra = status?.extra

  if (elapsed) {
    return `${elapsed}${extra ? `+${extra}` : ''}'`
  }

  return status?.short || status?.long || 'Live'
}

function normalizeLiveMatch(match) {
  const statusShort = match.status?.short || match.status?.long || 'Match'

  return {
    id: match.id,
    status: statusShort,
    statusLong: match.status?.long || statusShort,
    statusShort,
    isLive: LIVE_STATUSES.has(String(statusShort).toUpperCase()),
    timer: buildTimerLabel(match.status),
    elapsed: match.status?.elapsed,
    extra: match.status?.extra,
    score: match.score?.home == null && match.score?.away == null
      ? null
      : `${match.score?.home ?? '-'} - ${match.score?.away ?? '-'}`,
    lastEvent: match.lastEvent,
    updatedAt: match.updatedAt,
  }
}

function toMap(matches) {
  return Object.fromEntries(
    matches
      .map((match) => normalizeLiveMatch(match))
      .filter((match) => match.isLive)
      .map((match) => [match.id, match])
  )
}

function removeMatch(current, matchId) {
  const next = { ...current }
  delete next[matchId]
  return next
}

export function useLiveMatches() {
  const [matchesById, setMatchesById] = useState({})
  const [connectionStatus, setConnectionStatus] = useState('fallback')
  const [finalizedAt, setFinalizedAt] = useState('')

  useEffect(() => {
    let active = true
    let pollTimer = 0
    let socket = null

    async function refreshSnapshot() {
      try {
        const response = await getLiveMatches()
        if (active) setMatchesById(toMap(response.data || []))
      } catch {
        if (active) setConnectionStatus((current) => (current === 'connected' ? 'connected' : 'fallback'))
      }
    }

    function startPolling() {
      window.clearInterval(pollTimer)
      pollTimer = window.setInterval(refreshSnapshot, LIVE_REFRESH_MS)
    }

    refreshSnapshot()
    startPolling()

    loadSocketClient().then((socketFactory) => {
      if (!active) return

      if (!socketFactory) {
        setConnectionStatus('fallback')
        return
      }

      socket = socketFactory('/', {
        transports: ['websocket', 'polling'],
        withCredentials: true,
      })

      socket.on('connect', () => {
        setConnectionStatus('connected')
        socket.emit('live:subscribe')
        refreshSnapshot()
        window.clearInterval(pollTimer)
      })
      socket.on('disconnect', () => {
        setConnectionStatus('reconnecting')
        startPolling()
      })
      socket.on('connect_error', () => {
        setConnectionStatus('fallback')
        startPolling()
      })
      socket.on('match:score', (payload) => {
        const statusShort = payload.status || 'Live'
        const isLive = LIVE_STATUSES.has(String(statusShort).toUpperCase())
        if (!isLive) {
          setFinalizedAt(new Date().toISOString())
          window.setTimeout(refreshSnapshot, 750)
        }
        setMatchesById((current) => {
          if (!isLive) return removeMatch(current, payload.matchId)

          return {
            ...current,
            [payload.matchId]: {
              ...(current[payload.matchId] || { id: payload.matchId }),
              status: statusShort,
              statusShort,
              isLive,
              timer: buildTimerLabel(payload),
              elapsed: payload.elapsed,
              extra: payload.extra,
              score: payload.score?.home == null && payload.score?.away == null
                ? null
                : `${payload.score?.home ?? '-'} - ${payload.score?.away ?? '-'}`,
              updatedAt: payload.updatedAt,
            },
          }
        })
      })
      socket.on('match:event', (payload) => {
        setMatchesById((current) => {
          if (!current[payload.matchId]) return current

          return {
            ...current,
            [payload.matchId]: {
              ...current[payload.matchId],
              lastEvent: payload.event || payload,
              updatedAt: payload.updatedAt,
            },
          }
        })
      })
    })

    return () => {
      active = false
      window.clearInterval(pollTimer)
      if (socket) {
        socket.emit('live:unsubscribe')
        socket.disconnect()
      }
    }
  }, [])

  return { connectionStatus, matchesById, finalizedAt }
}
