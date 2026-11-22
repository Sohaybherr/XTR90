import { Flag, Goal, Radio, ShieldAlert, Siren, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { loadSocketClient } from '../../utils/socketClient'

const TOAST_TTL_MS = 7500
const MAX_TOASTS = 4

function text(value) {
  return String(value || '').toLowerCase()
}

function shouldIgnoreEvent(event) {
  const type = text(event?.type)
  const detail = text(event?.detail)

  if (type.includes('subst') || detail.includes('subst')) return true
  if (type.includes('card') && detail.includes('yellow') && !detail.includes('red')) return true

  return false
}

function classifyEvent(event) {
  const type = text(event?.type)
  const detail = text(event?.detail)

  if (type.includes('goal') || detail.includes('goal')) {
    if (detail.includes('own')) return { kind: 'own-goal', label: 'Own Goal', Icon: Goal }
    if (detail.includes('penalty')) return { kind: 'penalty-goal', label: 'Penalty Goal', Icon: Goal }
    return { kind: 'goal', label: 'Goal', Icon: Goal }
  }

  if (type.includes('card') && detail.includes('red')) {
    return { kind: 'red-card', label: detail.includes('second') ? 'Second Yellow' : 'Red Card', Icon: ShieldAlert }
  }

  if (type.includes('penalty') || detail.includes('penalty')) {
    return { kind: 'penalty', label: detail.includes('miss') ? 'Penalty Missed' : 'Penalty', Icon: Flag }
  }

  if (type.includes('var') || detail.includes('var')) {
    return { kind: 'var', label: 'VAR Check', Icon: Video }
  }

  return { kind: 'event', label: event?.type || 'Live Event', Icon: Siren }
}

function eventKey(event, matchId) {
  return event?.eventKey || event?.id || [
    matchId,
    event?.elapsed,
    event?.extra,
    event?.team?.id,
    event?.player?.id,
    event?.type,
    event?.detail,
  ].join(':')
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

function eventKeys(event, matchId) {
  const keys = [event?.eventKey, event?.id, eventKey(event, matchId)].filter(Boolean).map(String)
  return keys
}

function minuteLabel(event) {
  if (event?.elapsed == null) return 'Live'
  return `${event.elapsed}${event.extra ? `+${event.extra}` : ''}'`
}

function LiveEventNotifications() {
  const toLocale = useLocalizedPath()
  const [items, setItems] = useState([])
  const seenKeysRef = useRef(new Set())

  useEffect(() => {
    let active = true
    let socket = null

    loadSocketClient().then((socketFactory) => {
      if (!active || !socketFactory) return

      socket = socketFactory('/', {
        transports: ['websocket', 'polling'],
        withCredentials: true,
      })

      socket.on('connect', () => {
        socket.emit('live:subscribe')
      })

      socket.on('match:event', (payload) => {
        const event = payload?.event || payload
        const matchId = payload?.matchId || event?.matchId

        if (!matchId || shouldIgnoreEvent(event)) return

        const keys = eventKeys(event, matchId)
        const looseKey = eventLooseKey(event, matchId)
        if ([...keys, looseKey].some((key) => seenKeysRef.current.has(key))) return
        keys.forEach((key) => seenKeysRef.current.add(key))
        if (!hasEventPerson(event)) seenKeysRef.current.add(looseKey)
        const key = keys[0]

        const toast = {
          id: `${key}:${Date.now()}`,
          matchId,
          event,
          ...classifyEvent(event),
        }

        setItems((current) => [toast, ...current].slice(0, MAX_TOASTS))

        window.setTimeout(() => {
          setItems((current) => current.filter((item) => item.id !== toast.id))
        }, TOAST_TTL_MS)
      })
    })

    return () => {
      active = false
      if (socket) {
        socket.emit('live:unsubscribe')
        socket.disconnect()
      }
    }
  }, [])

  if (!items.length) return null

  return (
    <div className="live-notification-stack" aria-live="polite" aria-label="Live match events">
      {items.map(({ id, matchId, event, kind, label, Icon }) => (
        <Link className={`live-notification live-notification--${kind}`} to={toLocale(`/matches/${matchId}`)} key={id}>
          <span className="live-notification__icon">
            <Icon size={20} />
          </span>
          <span className="live-notification__content">
            <span className="live-notification__top">
              <strong>{label}</strong>
              <small>{minuteLabel(event)}</small>
            </span>
            <span className="live-notification__main">
              {event?.player?.name || event?.detail || 'Live match update'}
            </span>
            {event?.team?.name ? (
              <span className="live-notification__meta">
                <Radio size={13} />
                {event.team.name}
              </span>
            ) : null}
          </span>
        </Link>
      ))}
    </div>
  )
}

export default LiveEventNotifications
