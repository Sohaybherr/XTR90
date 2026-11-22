import MatchCard from '../cards/MatchCard'
import { Link } from 'react-router-dom'
import FavoriteButton from '../common/FavoriteButton'
import { resolveAssetUrl } from '../../utils/assets'
import { useI18n } from '../../hooks/useI18n'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function CompetitionSection({ competition, disableMatchLinks = false, showFavorites = true, todayMatchId }) {
  const { t } = useI18n()
  const toLocale = useLocalizedPath()
  const logoSrc = resolveAssetUrl(competition.logo)
  const seasonId = competition.matches.find((match) => match.competitionSeasonId)?.competitionSeasonId
  const competitionUrl = `/competitions/${competition.id}${seasonId ? `?seasonId=${seasonId}` : ''}`

  return (
    <section className="competition-section">
      <header className="competition-section__header">
        <Link className="competition-section__header-link" to={toLocale(competitionUrl)}>
          {logoSrc && (
            <img
              className="competition-section__logo"
              src={logoSrc}
              alt=""
              loading="lazy"
              decoding="async"
            />
          )}
          <div>
            <h3>{competition.name}</h3>
            <p>{t('matches.count', { count: competition.matches.length })}</p>
          </div>
        </Link>
        {showFavorites ? <FavoriteButton id={competition.id} type="competition" /> : null}
      </header>

      <div className="match-list">
        {competition.matches.map((match) => (
          <MatchCard
            className={match.isToday ? 'match-card--today' : ''}
            disableMatchLink={disableMatchLinks}
            id={todayMatchId === match.id ? 'today-match' : undefined}
            isToday={match.isToday}
            key={match.id}
            match={match}
            showFavoriteButton={showFavorites}
          />
        ))}
      </div>
    </section>
  )
}

export default CompetitionSection
