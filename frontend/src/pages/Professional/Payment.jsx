import { CreditCard, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function Payment() {
  const toLocale = useLocalizedPath()

  return (
    <section className="professional-page professional-page--narrow">
      <header className="professional-hero">
        <span className="professional-hero__icon"><CreditCard size={30} /></span>
        <div>
          <p className="eyebrow">Payment</p>
          <h1>Secure billing for XTRA90 plans.</h1>
          <p>Review plan details, payment security, and billing support before completing checkout.</p>
        </div>
      </header>

      <div className="professional-grid professional-grid--two">
        <article className="professional-card">
          <LockKeyhole size={22} />
          <h2>Protected checkout</h2>
          <p>Payment details should be handled by a certified provider. This page is ready for Stripe, PayPal, or your selected gateway.</p>
        </article>
        <article className="professional-card">
          <ShieldCheck size={22} />
          <h2>Billing control</h2>
          <p>Users can upgrade, cancel, or update payment details from their account once billing is connected.</p>
        </article>
      </div>

      <section className="professional-panel">
        <h2>Before payment integration</h2>
        <p>Connect a payment provider, define product IDs, then replace this informational panel with the provider checkout component.</p>
        <Link className="professional-button" to={toLocale('/contact')}>Contact billing support</Link>
      </section>
    </section>
  )
}

export default Payment
