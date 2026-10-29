import { useState } from 'react';
import type { Offer, Player, Role } from '../../engine';
import { ROLE_RANK, formatMoney, roleLabel } from '../../engine';
import { Button } from './ui';

export function OfferForm({
  p,
  initial,
  min,
  max,
  desiredRole,
  submitLabel,
  onSubmit,
}: {
  p: Player;
  initial: Offer;
  min: number;
  max: number;
  desiredRole: Role;
  submitLabel: string;
  onSubmit: (o: Offer) => void;
}) {
  const [salary, setSalary] = useState(initial.salary);
  const [years, setYears] = useState(initial.years);
  const [role, setRole] = useState<Role>(initial.role);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ salary, years, role });
      }}
    >
      <label className="block text-sm">
        <span className="flex justify-between text-slate-400">
          Gehalt (Cap Hit) <span className="font-mono text-slate-100">{formatMoney(salary)}</span>
        </span>
        <input type="range" min={min} max={max} step={25_000} value={salary} onChange={(e) => setSalary(Number(e.target.value))} className="w-full accent-sky-400" />
      </label>
      <label className="block text-sm">
        <span className="flex justify-between text-slate-400">
          Laufzeit <span className="font-mono text-slate-100">{years} Jahre</span>
        </span>
        <input type="range" min={1} max={8} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-full accent-sky-400" />
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        {(['top', 'middle', 'depth'] as Role[]).map((r) => (
          <button
            type="button"
            key={r}
            onClick={() => setRole(r)}
            className={`rounded-md border px-2 py-1.5 text-xs ${role === r ? 'border-ice-400 bg-ice-500/10 text-ice-200' : 'border-coal-600 text-slate-300'}`}
          >
            {roleLabel(r, p)}
            {ROLE_RANK[r] > ROLE_RANK[desiredRole] && <span className="block text-[10px] text-amber-300">Versprechen!</span>}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
