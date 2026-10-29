import type { FranchiseMeta, League, NewsItem } from '../../engine';
import { averageAttendance, cityById, dayLabel } from '../../engine';
import { useGame } from '../../store/game';
import { MANDATES } from '../text';
import { Panel, Tip } from './ui';

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 220;
  const h = 40;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 100) * h}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10" aria-hidden="true">
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Meter({ label, value, tip }: { label: string; value: number; tip: string }) {
  const color = value >= 65 ? 'bg-emerald-400' : value >= 45 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center">
          {label}
          <Tip text={tip} />
        </span>
        <span className="font-mono text-slate-100">{Math.round(value)}/100</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-coal-700">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function OwnerFansPanel({ league, meta }: { league: League; meta: FranchiseMeta }) {
  const mandate = MANDATES.find((m) => m.id === league.franchise?.mandate);
  const att = averageAttendance(league, meta);
  const cap = league.franchise ? cityById(league.franchise.cityId).arenaCapacity : 0;
  return (
    <Panel title="Owner & Fans">
      <div className="space-y-3 p-4 text-sm">
        <Meter
          label="Owner-Zufriedenheit"
          value={meta.ownerSatisfaction}
          tip={`Mandat „${mandate?.label ?? ''}“: ${mandate?.text ?? ''} Wird wöchentlich anhand des Punkteschnitts, der Playoff-Chancen und (je nach Mandat) Fans, Jugend oder Budget neu bewertet.`}
        />
        <Meter label="Fan-Stimmung" value={meta.fanMood} tip="Siege (vor allem zu Hause und in den Playoffs) heben die Stimmung, Niederlagen drücken sie. Langfristig pendelt sie zur Hockey-Tradition der Stadt zurück." />
        <div className="text-slate-400">
          <Sparkline values={meta.history.map((h) => h.owner)} color="#38bdf8" />
          <div className="flex justify-between text-[10px]">
            <span className="text-ice-300">— Owner</span>
            <span>Verlauf der Saison</span>
          </div>
        </div>
        <div className="flex justify-between rounded bg-coal-850 p-2 text-xs">
          <span className="text-slate-400">Zuschauerschnitt</span>
          <span className="font-mono text-slate-100">
            {att.avg ? `${att.avg.toLocaleString('de-DE')} / ${cap.toLocaleString('de-DE')} (${Math.round(att.fill * 100)} %)` : '–'}
          </span>
        </div>
      </div>
    </Panel>
  );
}

export function NewsFeed({ news, title = 'Newsfeed', limit = 30, className = '' }: { news: NewsItem[]; title?: string; limit?: number; className?: string }) {
  const year = useGame((s) => s.offLeague?.config.seasonStartYear);
  return (
    <Panel title={title} className={className}>
      <ul className="max-h-96 space-y-2 overflow-auto p-4">
        {[...news].reverse().slice(0, limit).map((n, i) => (
          <li key={i} className={`rounded-lg border-l-2 bg-coal-850 px-3 py-2 ${n.tone === 'good' ? 'border-emerald-400' : n.tone === 'bad' ? 'border-rose-400' : 'border-coal-500'}`}>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{dayLabel(n.day, year)}</div>
            <div className="text-sm font-semibold text-slate-100">{n.headline}</div>
            {n.body && <div className="text-xs text-slate-400">{n.body}</div>}
          </li>
        ))}
        {!news.length && <li className="text-sm text-slate-500">Noch keine Meldungen.</li>}
      </ul>
    </Panel>
  );
}
