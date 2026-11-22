import { useI18n } from '../../hooks/useI18n'

function Footer() {
  const { t } = useI18n()

  return (
    <footer className="footer">
      <span>XTRA90</span>
      <span>{t('footer.dashboard')}</span>
    </footer>
  )
}

export default Footer
