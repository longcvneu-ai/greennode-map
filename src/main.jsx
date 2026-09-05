import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import './AI/aiQueryTest'
import './AI/v2/queryPlanTest'
import './AI/v2/greennodeEndToEndTest'
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
