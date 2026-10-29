import { useGame } from '../store/game';
import { Header } from './components/Header';
import { PlayerModal } from './components/PlayerModal';
import { DraftBoard } from './screens/DraftBoard';
import { DraftNight } from './screens/DraftNight';
import { FoundingScreen } from './screens/FoundingScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { RevealScreen } from './screens/RevealScreen';
import { StartScreen } from './screens/StartScreen';
import { WindowScreen } from './screens/WindowScreen';

export function App() {
  const phase = useGame((s) => s.phase);
  return (
    <div className="flex min-h-screen flex-col">
      {phase !== 'start' && <Header />}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-10 pt-4 sm:px-6">
        {phase === 'start' && <StartScreen />}
        {phase === 'founding' && <FoundingScreen />}
        {phase === 'reveal' && <RevealScreen />}
        {phase === 'window' && <WindowScreen />}
        {phase === 'draft' && <DraftBoard />}
        {phase === 'night' && <DraftNight />}
        {phase === 'results' && <ResultsScreen />}
      </main>
      <PlayerModal />
    </div>
  );
}
