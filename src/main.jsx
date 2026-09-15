import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SolarProvider } from './SolarContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SolarProvider>
      <App />
    </SolarProvider>
  </StrictMode>,
)
