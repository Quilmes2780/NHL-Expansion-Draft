import { useMemo, useState } from 'react';
import { generateLeague, playersOfTeam, teamPayroll, formatMoney } from '../engine';

/** M1 debug view: generate a league per seed and inspect the rosters. */
export function App() {
  const [seed, setSeed] = useState('team33');
  const league = useMemo(() => generateLeague(seed), [seed]);
  const [teamId, setTeamId] = useState(league.teams[0]?.id ?? '');
  const roster = playersOfTeam(league, teamId).sort((a, b) => Number(a.farm) - Number(b.farm) || b.ovr - a.ovr);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-ice-300">Team 33 – Liga-Generator</h1>
      <input className="mt-3 rounded bg-coal-800 px-3 py-1" value={seed} onChange={(e) => setSeed(e.target.value)} />
      <select className="ml-3 rounded bg-coal-800 px-3 py-1" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
        {league.teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.city} {t.name} – {formatMoney(teamPayroll(league, t.id))}
          </option>
        ))}
      </select>
      <table className="mt-4 text-sm tabular">
        <tbody>
          {roster.map((p) => (
            <tr key={p.id}>
              <td className="pr-4">{p.firstName} {p.lastName}</td>
              <td className="pr-4">{p.position}</td>
              <td className="pr-4">{p.age}</td>
              <td className="pr-4">{p.ovr}</td>
              <td className="pr-4">{p.contract ? formatMoney(p.contract.capHit) : '–'}</td>
              <td>{p.farm ? 'Farm' : 'NHL'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
