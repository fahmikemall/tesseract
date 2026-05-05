import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Disable browser right-click context menu everywhere (we use custom menus)
window.addEventListener('contextmenu', (e) => e.preventDefault())

// Block browser-style shortcuts that don't make sense in a desktop app
window.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey
  // Block reload: F5, Ctrl+R, Ctrl+Shift+R
  if (e.key === 'F5' || (ctrl && e.key.toLowerCase() === 'r')) {
    e.preventDefault()
    e.stopPropagation()
  }
  // DevTools: F12 allowed temporarily for debugging
  // Block Ctrl+U (view source)
  if (ctrl && e.key.toLowerCase() === 'u') {
    e.preventDefault()
    e.stopPropagation()
  }
}, true) // capture phase — intercept before anything else

// StrictMode disabled — double-invocation causes issues with SSH/PTY connections
createRoot(document.getElementById('root')!).render(
  <App />
)
