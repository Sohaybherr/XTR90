import { BadgeDollarSign, Check, ShieldCheck, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function Plans() {
  const toLocale = useLocalizedPath()
  const plans = [
    {
      name: 'Starter',
      price: 'Free',
      description: 'Follow scores, fixtures, news, and favorite teams.',
      features: ['Live match center', 'Favorites list', 'Localized content'],
    },
    {
      name: 'Pro',
      price: '$6',
      description: 'For fans who want richer match intelligence.',
      features: ['Advanced match insights', 'Priority notifications', 'Odds visibility controls'],
      featured: true,
    },
    {
      name: 'Club',
      price: '$19',
      description: 'For teams, analysts, and community managers.',
      features: ['Team dashboards', 'Export-ready reports', 'Shared account access'],
    },
  ]

  return (
    <section className="professional-page">
      <header className="professional-hero">
        <span className="professional-hero__icon"><Star size={30} /></span>
        <div>
          <p className="eyebrow">Plans</p>
          <h1>Choose the XTRA90 plan that fits how you follow football.</h1>
          <p>Simple packages for casual fans, power users, and football operations teams.</p>
        </div>
      </header>

      <div className="plan-grid">
        {plans.map((plan) => (
          <article className={`plan-card${plan.featured ? ' plan-card--featured' : ''}`} key={plan.name}>
            <div className="plan-card__top">
              <strong>{plan.name}</strong>
              {plan.featured ? <span>Popular</span> : null}
            </div>
            <p className="plan-card__price">{plan.price}<small>{plan.price === 'Free' ? '' : '/mo'}</small></p>
            <p>{plan.description}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}><Check size={16} />{feature}</li>
              ))}
            </ul>
            <Link className="professional-button" to={toLocale('/payment')}>
              <BadgeDollarSign size={17} />
              Select plan
            </Link>
          </article>
        ))}
      </div>

      <section className="professional-band">
        <ShieldCheck size={22} />
        <span>Every plan keeps account preferences, language, and responsible betting controls easy to manage.</span>
      </section>
    </section>
  )
}

export default Plans
