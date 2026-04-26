import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { WsProvider } from './context/WsContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WsProvider>
      <App />
    </WsProvider>
  </StrictMode>,
)
