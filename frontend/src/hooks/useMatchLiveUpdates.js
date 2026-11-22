import { useEffect, useRef, useState } from 'react'
import { getMatchDetails } from '../api/matches'
import { loadSocketClient } from '../utils/socketClient'

const LIVE_REFRESH_MS = 10000
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN'])

function eventKey(event, matchId) {
  return eventVisibleKey(event, matchId)
}

function eventLooseKey(event, matchId) {
  return [
    matchId,
    event?.elapsed,
    event?.extra,
    event?.team?.id,
    event?.type,
    event?.detail,
  ].join(':')
}

function hasEventPerson(event) {
  return Boolean(event?.player?.id || event?.player?.name || event?.assistPlayer?.id || event?.assistPlayer?.name)
}

function isSameEvent(existing, incoming, matchId) {
  if (eventKey(existing, matchId) === eventKey(incoming, matchId)) return true
  if (eventStableKey(existing, matchId) === eventStableKey(incoming, matchId)) return true

  const canUseLooseKey = !hasEventPerson(existing) || !hasEventPerson(incoming)
  return canUseLooseKey && eventLooseKey(existing, matchId) === eventLooseKey(incoming, matchId)
}

function eventStableKey(event, matchId) {
  return event?.eventKey || event?.id || eventVisibleKey(event, matchId)
}

function eventVisibleKey(event, matchId) {
  return [
    matchId,
    event?.elapsed,
    event?.extra,
    event?.team?.id,
    event?.player?.id,
    event?.player?.name,
    event?.assistPlayer?.id,
    event?.assistPlayer?.name,
    event?.type,
    event?.detail,
    event?.comments,
  ].join(':')
}

function eventWeight(event) {
  return [
    event?.id,
    event?.player?.id,
    event?.player?.name,
    event?.assistPlayer?.id,
    event?.assistPlayer?.name,
    event?.comments,
  ].filter(Boolean).length
}

function appendEvent(events, event, matchId) {
  const duplicateIndex = events.findIndex((item) => isSameEvent(item, event, matchId))

  if (duplicateIndex !== -1) {
    const nextEvents = [...events]
    if (eventWeight(event) >= eventWeight(nextEvents[duplicateIndex])) {
      nextEvents[duplicateIndex] = {
        ...nextEvents[duplicateIndex],
        ...event,
      }
    }
    return sortEvents(nextEvents)
  }

  return sortEvents([...events, event])
}

function sortEvents(events) {
  return [...events].sort(
    (a, b) =>
      (a.elapsed ?? 0) - (b.elapsed ?? 0) ||
      (a.extra ?? 0) - (b.extra ?? 0) ||
      (a.order ?? 0) - (b.order ?? 0) ||
      String(eventStableKey(a, '')).localeCompare(String(eventStableKey(b, '')))
  )
}

function dedupeEvents(events, matchId) {
  if (!Array.isArray(events)) return []

  return events.reduce((current, event) => appendEvent(current, event, matchId), [])
}

function normalizeTeamStatistics(statistics, details) {
  if (!Array.isArray(statistics)) return statistics

  const homeTeamId = details?.teams?.home?.id == null ? '' : String(details.teams.home.id)
  const awayTeamId = details?.teams?.away?.id == null ? '' : String(details.teams.away.id)
  const byTeam = new Map(statistics.map((row) => [String(row?.team?.id), row?.statistics || null]))

  return {
    home: byTeam.get(homeTeamId) || details?.statistics?.home || null,
    away: byTeam.get(awayTeamId) || details?.statistics?.away || null,
  }
}

function patchDetails(details, eventName, payload, matchId) {
  if (!details) return details

  if (eventName === 'match:score') {
    return {
      ...details,
      score: payload.score || details.score,
      match: {
        ...details.match,
        status: {
          ...details.match?.status,
          short: payload.status ?? details.match?.status?.short,
          elapsed: payload.elapsed ?? details.match?.status?.elapsed,
          extra: payload.extra ?? details.match?.status?.extra,
          updatedAt: payload.updatedAt ?? new Date().toISOString(),
        },
      },
    }
  }

  if (eventName === 'match:status') {
    return {
      ...details,
      match: {
        ...details.match,
        status: {
          ...details.match?.status,
          ...payload.status,
        },
      },
    }
  }

  if (eventName === 'match:event') {
    return {
      ...details,
      events: appendEvent(details.events || [], payload.event || payload, matchId),
    }
  }

  if (eventName === 'match:events') {
    return {
      ...details,
      events: Array.isArray(payload.events) ? dedupeEvents(payload.events, matchId) : details.events || [],
    }
  }

  if (eventName === 'match:lineups') return { ...details, lineups: payload.lineups || payload }
  if (eventName === 'match:statistics') {
    return {
      ...details,
      statistics: normalizeTeamStatistics(payload.statistics || payload, details),
    }
  }
  if (eventName === 'match:player-statistics') return { ...details, playerStatistics: payload.playerStatistics || payload }
  if (eventName === 'match:updated') return { ...details, ...payload }
  return details
}

export function useMatchLiveUpdates(matchId, setDetails) {
  const [connectionStatus, setConnectionStatus] = useState('fallback')
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const socketRef = useRef(null)

  useEffect(() => {
    if (!matchId) return undefined

    let active = true
    let pollTimer = 0
    let snapshotTimer = 0
    let socket = null

    async function refreshSnapshot() {
      try {
        const response = await getMatchDetails(matchId)
        if (!active) return
        setDetails(response.data)
        setLastUpdatedAt(new Date().toISOString())
      } catch {
        if (active) setConnectionStatus((current) => (current === 'connected' ? 'connected' : 'fallback'))
      }
    }

    function startPolling() {
      window.clearInterval(pollTimer)
      pollTimer = window.setInterval(refreshSnapshot, LIVE_REFRESH_MS)
    }

    function startSnapshotRefresh() {
      window.clearInterval(snapshotTimer)
      snapshotTimer = window.setInterval(refreshSnapshot, LIVE_REFRESH_MS)
    }

    startSnapshotRefresh()

    const patch = (eventName) => (payload) => {
      setDetails((current) => patchDetails(current, eventName, payload, matchId))
      setLastUpdatedAt(new Date().toISOString())
    }

    const handleScore = (payload) => {
      patch('match:score')(payload)
      if (FINAL_STATUSES.has(String(payload?.status || '').toUpperCase())) {
        window.setTimeout(refreshSnapshot, 750)
      }
    }

    const handlers = {
      'match:score': handleScore,
      'match:status': patch('match:status'),
      'match:event': patch('match:event'),
      'match:events': patch('match:events'),
      'match:lineups': patch('match:lineups'),
      'match:statistics': patch('match:statistics'),
      'match:player-statistics': patch('match:player-statistics'),
      'match:updated': patch('match:updated'),
    }

    loadSocketClient().then((socketFactory) => {
      if (!active) return

      if (!socketFactory) {
        setConnectionStatus('fallback')
        startPolling()
        return
      }

      socket = socketFactory('/', {
        transports: ['websocket', 'polling'],
        withCredentials: true,
      })
      socketRef.current = socket

      socket.on('connect', () => {
        setConnectionStatus('connected')
        socket.emit('match:subscribe', matchId)
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

      Object.entries(handlers).forEach(([eventName, handler]) => socket.on(eventName, handler))
    })

    return () => {
      active = false
      window.clearInterval(pollTimer)
      window.clearInterval(snapshotTimer)
      if (socket) {
        socket.emit('match:unsubscribe', matchId)
        Object.entries(handlers).forEach(([eventName, handler]) => socket.off(eventName, handler))
        socket.disconnect()
      }
    }
  }, [matchId, setDetails])

  return { connectionStatus, lastUpdatedAt }
}
