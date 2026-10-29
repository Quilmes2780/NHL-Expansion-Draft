import { useGame } from '../../store/game';
import { TUTORIAL } from '../text';
import { Button } from './ui';

/** Optional, once-per-phase hint card. */
export function TutorialHint() {
  const { phase, settings, updateSettings } = useGame();
  const tip = TUTORIAL[phase];
  if (!settings.tutorial || !tip || settings.seenTips.includes(phase)) return null;
  return (
    <aside
      role="note"
      aria-label="Tutorial"
      className="animate-pick-in fixed bottom-4 right-4 z-40 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-ice-400/50 bg-coal-900/95 p-4 shadow-2xl backdrop-blur"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ice-300">Tutorial</div>
      <div className="mt-1 font-bold text-white">{tip.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-slate-300">{tip.text}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => updateSettings({ tutorial: false })}>
          Tutorial aus
        </Button>
        <Button className="px-2.5 py-1 text-xs" onClick={() => updateSettings({ seenTips: [...settings.seenTips, phase] })}>
          Verstanden
        </Button>
      </div>
    </aside>
  );
}
