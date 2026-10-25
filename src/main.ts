import '@fontsource/luckiest-guy';
import './style.css';
import { Game } from './game/Game';

const game = new Game(document.getElementById('app')!);

// Dev builds only: lets test scripts trigger power-ups, spawn obstacles, etc.
if (import.meta.env.DEV) Object.assign(window, { game });
