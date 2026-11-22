import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Circle,
  Compass,
  Goal,
  Info,
  Play,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Star,
  Trophy,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

const MISSIONS = [
  {
    id: 'live',
    title: 'Find the live board',
    reward: 120,
    icon: CalendarDays,
    route: '/matches',
    cta: 'Open matches',
    task: 'Use the match board to scan live, scheduled, and finished games by date.',
    lesson: 'The home screen is your scoreboard. Match status badges tell you what needs attention first.',
  },
  {
    id: 'search',
    title: 'Search for anything',
    reward: 90,
    icon: Search,
    route: '/search',
    cta: 'Try search',
    task: 'Look up teams, players, competitions, or news from one place.',
    lesson: 'Search is the fastest way to jump directly to a club, player profile, or competition page.',
  },
  {
    id: 'details',
    title: 'Read a match like a scout',
    reward: 150,
    icon: Goal,
    route: '/matches',
    cta: 'Pick a match',
    task: 'Open a match and check score, timeline, lineups, stats, and context.',
    lesson: 'Match pages collect the story of the game, so you do not need to switch between screens.',
  },
  {
    id: 'favorites',
    title: 'Build your locker',
    reward: 110,
    icon: Star,
    route: '/favorites',
    cta: 'View favorites',
    task: 'Save teams, players, matches, or news so they are easy to return to.',
    lesson: 'Favorites turn the platform into your own football dashboard.',
  },
  {
    id: 'settings',
    title: 'Tune your controls',
    reward: 80,
    icon: SlidersHorizontal,
    route: '/menu',
    cta: 'Open menu',
    task: 'Change language, theme, account actions, and content preferences.',
    lesson: 'The menu is where platform behavior changes to match how you want to browse.',
  },
]

function progressFromStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem('learnMissionsComplete') || '[]')
    return new Set(Array.isArray(stored) ? stored : [])
  } catch {
    return new Set()
  }
}

function saveProgress(nextSet) {
  try {
    localStorage.setItem('learnMissionsComplete', JSON.stringify([...nextSet]))
  } catch {
    // Progress still works during this session when storage is unavailable.
  }
}

function Learn() {
  const toLocale = useLocalizedPath()
  const [activeMissionId, setActiveMissionId] = useState(MISSIONS[0].id)
  const [complete, setComplete] = useState(progressFromStorage)
  const activeMission = MISSIONS.find((mission) => mission.id === activeMissionId) || MISSIONS[0]
  const completedCount = complete.size
  const totalReward = useMemo(
    () => MISSIONS.reduce((sum, mission) => sum + (complete.has(mission.id) ? mission.reward : 0), 0),
    [complete],
  )
  const progressPercent = Math.round((completedCount / MISSIONS.length) * 100)

  function toggleMission(missionId) {
    setComplete((current) => {
      const next = new Set(current)
      if (next.has(missionId)) {
        next.delete(missionId)
      } else {
        next.add(missionId)
      }
      saveProgress(next)
      return next
    })
  }

  function resetProgress() {
    setComplete(new Set())
    saveProgress(new Set())
  }

  return (
    <section className="learn-page">
      <header className="learn-hero">
        <div className="learn-hero__copy">
          <p className="eyebrow">Training mode</p>
          <h1>Learn XTRA90 by playing through the basics.</h1>
          <p>
            Complete short missions, earn points, and learn where each platform feature lives before you start following real matches.
          </p>
          <div className="learn-hero__actions">
            <a className="learn-primary-action" href="#first-mission">
              <Play size={18} />
              <span>Start tutorial</span>
            </a>
            <button className="learn-secondary-action" type="button" onClick={resetProgress}>
              <RotateCcw size={17} />
              <span>Reset</span>
            </button>
          </div>
        </div>
        <div className="learn-scoreboard" aria-label="Tutorial progress">
          <div className="learn-scoreboard__header">
            <Trophy size={22} />
            <span>Rookie League</span>
          </div>
          <strong>{totalReward}</strong>
          <small>XP earned</small>
          <div className="learn-progress">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <p>{completedCount} of {MISSIONS.length} missions complete</p>
        </div>
      </header>

      <div className="learn-layout">
        <aside className="learn-mission-list" aria-label="Tutorial missions">
          {MISSIONS.map((mission, index) => {
            const MissionIcon = mission.icon
            const isActive = mission.id === activeMission.id
            const isComplete = complete.has(mission.id)

            return (
              <button
                className={`learn-mission-tab${isActive ? ' learn-mission-tab--active' : ''}${isComplete ? ' learn-mission-tab--complete' : ''}`}
                id={index === 0 ? 'first-mission' : undefined}
                key={mission.id}
                onClick={() => setActiveMissionId(mission.id)}
                type="button"
              >
                <span className="learn-mission-tab__state">
                  {isComplete ? <BadgeCheck size={18} /> : <Circle size={18} />}
                </span>
                <MissionIcon size={19} />
                <span>{mission.title}</span>
              </button>
            )
          })}
        </aside>

        <article className="learn-stage">
          <div className="learn-stage__topline">
            <span>
              <Shield size={17} />
              Mission
            </span>
            <strong>+{activeMission.reward} XP</strong>
          </div>
          <h2>{activeMission.title}</h2>
          <p>{activeMission.task}</p>

          <div className="learn-game-panel">
            <div className="learn-field">
              <span className="learn-field__line learn-field__line--left" />
              <span className="learn-field__line learn-field__line--right" />
              <span className="learn-field__circle" />
              <span className="learn-player learn-player--one" />
              <span className="learn-player learn-player--two" />
              <span className="learn-player learn-player--three" />
            </div>
            <div className="learn-callout">
              <Info size={18} />
              <span>{activeMission.lesson}</span>
            </div>
          </div>

          <div className="learn-stage__actions">
            <button
              className={`learn-complete-button${complete.has(activeMission.id) ? ' learn-complete-button--done' : ''}`}
              onClick={() => toggleMission(activeMission.id)}
              type="button"
            >
              <BadgeCheck size={18} />
              <span>{complete.has(activeMission.id) ? 'Completed' : 'Mark complete'}</span>
            </button>
            <Link className="learn-route-button" to={toLocale(activeMission.route)}>
              <span>{activeMission.cta}</span>
              <ChevronRight size={17} />
            </Link>
          </div>
        </article>
      </div>

      <section className="learn-quick-map">
        <div>
          <Compass size={22} />
          <h2>Platform map</h2>
          <p>Use this when you are lost: Matches show what is happening, Search finds entities, Favorites saves what matters, and Menu controls your setup.</p>
        </div>
      </section>
    </section>
  )
}

export default Learn
