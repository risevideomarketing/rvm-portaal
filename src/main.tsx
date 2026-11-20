import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthGate } from './Auth'
import { pasThemaToe } from './pages/Instellingen'
import './styles.css'

// Licht of donker, zoals ingesteld op Instellingen (vóór de eerste weergave, geen flits)
pasThemaToe()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
