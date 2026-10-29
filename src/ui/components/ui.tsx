import type { ReactNode } from 'react';
import { useState } from 'react';
import type { Light, Range } from '../../engine';

export function Tip({ text, children, className = '' }: { text: string; children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children ?? (
        <button type="button" aria-label="Regel erklären" className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-ice-400/50 text-[10px] font-bold text-ice-300 hover:bg-ice-400/20">
          ?
        </button>
      )}
      {open && (
        <span role="tooltip" className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border border-coal-600 bg-coal-800 p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-200 shadow-2xl">
          {text}
        </span>
      )}
    </span>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'subtle';

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  title,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: 'button' | 'submit';
}) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-ice-500 text-coal-950 hover:bg-ice-400 shadow-[0_0_20px_-6px_rgb(14_165_233/0.8)]',
    ghost: 'border border-coal-600 text-slate-200 hover:border-ice-400/60 hover:bg-coal-800',
    danger: 'bg-rose-500/90 text-white hover:bg-rose-400',
    subtle: 'bg-coal-800 text-slate-200 hover:bg-coal-700',
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Panel({ children, className = '', title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-coal-700 bg-coal-900/80 backdrop-blur ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-coal-700 px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ice-300">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export const LIGHT_COLOR: Record<Light, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_10px_rgb(52_211_153/0.7)]',
  warn: 'bg-amber-400 shadow-[0_0_10px_rgb(251_191_36/0.6)]',
  bad: 'bg-rose-500 shadow-[0_0_10px_rgb(244_63_94/0.7)]',
};

export function LightDot({ status }: { status: Light }) {
  return <span aria-label={status} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${LIGHT_COLOR[status]}`} />;
}

export function Badge({ children, tone = 'slate', title }: { children: ReactNode; tone?: 'slate' | 'ice' | 'amber' | 'rose' | 'emerald' | 'violet'; title?: string }) {
  const tones = {
    slate: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    ice: 'bg-ice-500/15 text-ice-300 border-ice-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  };
  return (
    <span title={title} className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Horizontal bar showing a rating range on a 20–99 scale. */
export function RangeBar({ range, accent = 'var(--color-ice-400)' }: { range: Range; accent?: string }) {
  const pct = (v: number) => ((Math.max(20, Math.min(99, v)) - 20) / 79) * 100;
  const lo = pct(range[0]);
  const hi = pct(range[1]);
  const exact = range[0] === range[1];
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-coal-700">
      {exact ? (
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${hi}%`, background: accent }} />
      ) : (
        <>
          <div className="absolute inset-y-0 left-0 rounded-full opacity-90" style={{ width: `${lo}%`, background: accent }} />
          <div
            className="absolute inset-y-0 rounded-full opacity-40"
            style={{ left: `${lo}%`, width: `${Math.max(1.5, hi - lo)}%`, background: `repeating-linear-gradient(45deg, ${accent}, ${accent} 3px, transparent 3px, transparent 6px)` }}
          />
        </>
      )}
    </div>
  );
}

export function ScoutDots({ level, max = 3 }: { level: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Scouting-Stufe ${level} von ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < level ? 'bg-ice-400' : 'bg-coal-600'}`} />
      ))}
    </span>
  );
}

export const GRADE_COLOR: Record<string, string> = {
  A: 'text-emerald-300 border-emerald-400/50 bg-emerald-500/10',
  B: 'text-lime-300 border-lime-400/50 bg-lime-500/10',
  C: 'text-amber-300 border-amber-400/50 bg-amber-500/10',
  D: 'text-orange-300 border-orange-400/50 bg-orange-500/10',
  F: 'text-rose-300 border-rose-400/50 bg-rose-500/10',
};

export function GradeBadge({ grade, size = 'md' }: { grade: string; size?: 'sm' | 'md' | 'xl' }) {
  const s = size === 'xl' ? 'h-24 w-24 text-6xl' : size === 'md' ? 'h-9 w-9 text-lg' : 'h-6 w-6 text-xs';
  return <span className={`inline-flex items-center justify-center rounded-lg border font-black ${s} ${GRADE_COLOR[grade] ?? ''}`}>{grade}</span>;
}
