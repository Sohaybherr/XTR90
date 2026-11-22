import { Navigate } from 'react-router-dom'
import { useI18n } from '../hooks/useI18n'

function RootRedirect() {
  const { language } = useI18n()
  return <Navigate replace to={`/${language}`} />
}

export default RootRedirect
