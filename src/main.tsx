import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/error-tracking' // Register global error handlers
import { loadAnalyticsIfConsented } from './lib/analytics'
import App from './App.tsx'
import { registerServiceWorker } from './lib/register-sw'

// LGPD: only load analytics if the user has previously consented.
// On first visit, CookieConsent banner shows and loads it on accept.
loadAnalyticsIfConsented()

if (import.meta.env.PROD) registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
