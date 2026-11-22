import { createRoot } from 'react-dom/client'
import './index.css'
import { bootstrapI18n } from './i18n/bootstrap'
import App from './App.jsx'

await bootstrapI18n()

createRoot(document.getElementById('root')).render(
  <App />,
)
