import { FileText, ShieldCheck } from 'lucide-react'

function Conditions() {
  return (
    <section className="professional-page professional-page--narrow">
      <header className="professional-hero">
        <span className="professional-hero__icon"><FileText size={30} /></span>
        <div>
          <p className="eyebrow">Conditions</p>
          <h1>Terms and conditions for using XTRA90.</h1>
          <p>Clear rules for accounts, content, payments, and responsible use of football data.</p>
        </div>
      </header>

      <div className="terms-list">
        {[
          ['Account use', 'Keep login details private and use the platform in a lawful, respectful way.'],
          ['Sports data', 'Scores, fixtures, odds, and statistics can change quickly and may be delayed or corrected.'],
          ['Paid plans', 'Subscription access begins after successful payment and remains active for the billing period.'],
          ['Responsible content', 'Odds controls are provided so users can hide betting-related content when needed.'],
          ['Support', 'Contact support for account, billing, or data concerns.'],
        ].map(([title, text]) => (
          <article className="terms-item" key={title}>
            <ShieldCheck size={19} />
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default Conditions
