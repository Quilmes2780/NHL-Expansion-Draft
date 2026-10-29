import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { RULE_SETS } from './engine';
import { useGame } from './store/game';

// Dev-only hook for driving the game from the browser console during testing.
if (import.meta.env.DEV) Object.assign(window, { __game: useGame, __rules: RULE_SETS });

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
