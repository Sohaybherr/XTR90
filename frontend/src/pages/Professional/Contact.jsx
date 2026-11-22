import { Mail, MapPin, MessageSquare, Phone } from 'lucide-react'

function Contact() {
  return (
    <section className="professional-page professional-page--narrow">
      <header className="professional-hero">
        <span className="professional-hero__icon"><MessageSquare size={30} /></span>
        <div>
          <p className="eyebrow">Contact</p>
          <h1>Get help from the XTRA90 team.</h1>
          <p>Use this page for account support, billing questions, data corrections, and partnership requests.</p>
        </div>
      </header>

      <div className="professional-grid professional-grid--two">
        <article className="professional-card">
          <Mail size={22} />
          <h2>Email</h2>
          <p>support@xtra90.com</p>
        </article>
        <article className="professional-card">
          <Phone size={22} />
          <h2>Phone</h2>
          <p>+1 555 990 9090</p>
        </article>
        <article className="professional-card">
          <MapPin size={22} />
          <h2>Office</h2>
          <p>Remote support, Monday to Friday.</p>
        </article>
        <article className="professional-card">
          <MessageSquare size={22} />
          <h2>Response</h2>
          <p>Most requests are reviewed within one business day.</p>
        </article>
      </div>
    </section>
  )
}

export default Contact
