// Builds private-data/del-league.json (format "team33-league" v1) with the DEL and DEL2 teams of 2026-27
// from private-data/del/ep-data.txt (rosters + 2025-26/2026-27 league stats, collected from eliteprospects.com).
//   #ROSTER lines: League;teamSlug;playerId;Name (Pos)["C"];Age;Born;Nation;Shoots;ContractEnd (e.g. 26/27, Junior, Loan)
//   #STATS lines:  league;year;s|g;playerId;GP;Points (skaters) or SV% (goalies)
// Optional private-data/del/_overrides.txt: "playerId;OVR" or "Full Name;OVR" per line.
// Ratings are derived from the stats (league-adjusted points per game / save percentage); salaries are fictional
// in-game dollars, because DEL salaries are not public.
// Usage: node scripts/build-del-league.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DIR = 'private-data/del';
// [slug, abbrev, city, name, conference, division, primaryColor, secondaryColor, lat, lon]
const TEAMS = [
  ['eisbaren-berlin', 'EBB', 'Berlin', 'Eisbären', 'DEL', 'DEL Nord', '#002B5C', '#E30613', 52.51, 13.44],
  ['fischtown-pinguins', 'BHV', 'Bremerhaven', 'Fischtown Pinguins', 'DEL', 'DEL Nord', '#00A0DF', '#1C1C1C', 53.55, 8.58],
  ['grizzlys-wolfsburg', 'WOB', 'Wolfsburg', 'Grizzlys', 'DEL', 'DEL Nord', '#009A44', '#1D1D1B', 52.42, 10.79],
  ['iserlohn-roosters', 'IEC', 'Iserlohn', 'Roosters', 'DEL', 'DEL Nord', '#00519E', '#E30613', 51.37, 7.7],
  ['krefeld-pinguine', 'KEV', 'Krefeld', 'Pinguine', 'DEL', 'DEL Nord', '#1D1D1B', '#FFD500', 51.33, 6.56],
  ['kolner-haie', 'KEC', 'Köln', 'Haie', 'DEL', 'DEL Nord', '#E2001A', '#FFFFFF', 50.94, 7.0],
  ['lowen-frankfurt', 'FRA', 'Frankfurt', 'Löwen', 'DEL', 'DEL Nord', '#E30613', '#1D1D1B', 50.11, 8.73],
  ['adler-mannheim', 'MAN', 'Mannheim', 'Adler', 'DEL', 'DEL Süd', '#1D3E8C', '#E2001A', 49.47, 8.51],
  ['augsburger-panther', 'AEV', 'Augsburg', 'Panther', 'DEL', 'DEL Süd', '#CE1126', '#00704A', 48.37, 10.9],
  ['ehc-munchen', 'RBM', 'München', 'EHC Red Bull', 'DEL', 'DEL Süd', '#D6001C', '#002D62', 48.17, 11.55],
  ['erc-ingolstadt', 'ING', 'Ingolstadt', 'ERC Panther', 'DEL', 'DEL Süd', '#0A3A82', '#FFFFFF', 48.76, 11.43],
  ['nurnberg-ice-tigers', 'NIT', 'Nürnberg', 'Ice Tigers', 'DEL', 'DEL Süd', '#1A1A1A', '#E2001A', 49.43, 11.12],
  ['schwenninger-wild-wings', 'SWW', 'Schwenningen', 'Wild Wings', 'DEL', 'DEL Süd', '#002F6C', '#FFFFFF', 48.06, 8.53],
  ['straubing-tigers', 'STR', 'Straubing', 'Tigers', 'DEL', 'DEL Süd', '#00285E', '#FFFFFF', 48.88, 12.57],
  ['dresdner-eislowen', 'DRE', 'Dresden', 'Eislöwen', 'DEL2', 'DEL2 Nord', '#003A80', '#FFFFFF', 51.04, 13.73],
  ['dusseldorfer-eg', 'DEG', 'Düsseldorf', 'DEG', 'DEL2', 'DEL2 Nord', '#E2001A', '#FFD500', 51.25, 6.79],
  ['ec-kassel-huskies', 'KSW', 'Kassel', 'Huskies', 'DEL2', 'DEL2 Nord', '#C8102E', '#0A2240', 51.3, 9.49],
  ['eispiraten-crimmitschau', 'ETC', 'Crimmitschau', 'Eispiraten', 'DEL2', 'DEL2 Nord', '#003A7D', '#FFFFFF', 50.82, 12.38],
  ['lausitzer-fuchse', 'LFX', 'Weißwasser', 'Lausitzer Füchse', 'DEL2', 'DEL2 Nord', '#F37021', '#1D1D1B', 51.5, 14.64],
  ['ec-bad-nauheim', 'BNA', 'Bad Nauheim', 'Rote Teufel', 'DEL2', 'DEL2 Nord', '#E30613', '#1D1D1B', 50.37, 8.75],
  ['blue-devils-weiden', 'WEI', 'Weiden', 'Blue Devils', 'DEL2', 'DEL2 Nord', '#0033A0', '#E30613', 49.67, 12.16],
  ['bietigheim-steelers', 'BIE', 'Bietigheim', 'Steelers', 'DEL2', 'DEL2 Süd', '#00843D', '#1D1D1B', 48.96, 9.13],
  ['ecdc-memmingen-indians', 'MEM', 'Memmingen', 'Indians', 'DEL2', 'DEL2 Süd', '#E30613', '#1D1D1B', 47.99, 10.18],
  ['ehc-freiburg', 'FRE', 'Freiburg', 'Wölfe', 'DEL2', 'DEL2 Süd', '#B5121B', '#1D1D1B', 47.99, 7.85],
  ['ev-landshut', 'LAN', 'Landshut', 'EV', 'DEL2', 'DEL2 Süd', '#C8102E', '#FFFFFF', 48.54, 12.15],
  ['eisbaren-regensburg', 'REG', 'Regensburg', 'Eisbären', 'DEL2', 'DEL2 Süd', '#1D1D1B', '#00539F', 49.01, 12.1],
  ['ravensburg-towerstars', 'RAV', 'Ravensburg', 'Towerstars', 'DEL2', 'DEL2 Süd', '#002F6C', '#E30613', 47.78, 9.61],
  ['starbulls-rosenheim', 'ROS', 'Rosenheim', 'Starbulls', 'DEL2', 'DEL2 Süd', '#00843D', '#FFFFFF', 47.86, 12.12],
];

const POS = { C: 'C', LW: 'LW', RW: 'RW', W: 'RW', F: 'C', D: 'D', G: 'G' };
// DEL2 production counts for a bit more than half of DEL production.
const LEAGUE_FACTOR = { del: 1, del2: 0.55 };
const SV_ADJUST = { del: 0, del2: -0.012 };
const MIN_SALARY = 850_000;
const warnings = [];

const lines = readFileSync(`${DIR}/ep-data.txt`, 'utf8').split(/\r?\n/);
const roster = [];
const skaterStats = new Map(); // id -> [{ league, year, gp, pts }]
const goalieStats = new Map(); // id -> [{ league, year, gp, sv }]
let section = '';
for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith('#')) {
    section = line;
    continue;
  }
  const c = line.split(';');
  if (section === '#ROSTER') roster.push(c);
  else if (section === '#STATS') {
    const [league, year, kind, id, gp, val] = c;
    const map = kind === 'g' ? goalieStats : skaterStats;
    const entry = { league, year: Number(year), gp: Number(gp) || 0 };
    if (kind === 'g') entry.sv = Number(val) || 0;
    else entry.pts = Number(val) || 0;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(entry);
  }
}

const overrides = new Map();
if (existsSync(`${DIR}/_overrides.txt`)) {
  for (const raw of readFileSync(`${DIR}/_overrides.txt`, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ovr] = line.split(';').map((s) => s.trim());
    overrides.set(key, Number(ovr));
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Skater OVR from league-adjusted points per game, shrunk towards a prior for small samples. */
function skaterOvr(id, position, age, nation, league) {
  const isD = position === 'D';
  const imported = nation && nation !== 'GER';
  // Prior production (DEL-equivalent points per game) for players without much DEL/DEL2 history.
  let prior = age <= 20 ? 0.08 : imported ? (league === 'DEL' ? 0.55 : 0.5) : league === 'DEL' ? 0.2 : 0.12;
  if (isD) prior *= 0.6;
  let pts = prior * 12;
  let gp = 12;
  for (const s of skaterStats.get(id) ?? []) {
    pts += s.pts * LEAGUE_FACTOR[s.league];
    gp += s.gp;
  }
  let ppg = pts / gp;
  if (isD) ppg *= 1.35;
  let ovr = 58 + 23 * Math.sqrt(Math.max(0, ppg));
  if (age <= 19) ovr -= 3;
  if (age >= 36) ovr -= 2;
  return Math.round(clamp(ovr, 50, 86));
}

/** Goalie OVR from league-adjusted save percentage, shrunk towards a prior. */
function goalieOvr(id, age, nation, league) {
  const imported = nation && nation !== 'GER';
  const priorSv = age <= 20 ? 0.885 : imported ? (league === 'DEL' ? 0.905 : 0.9) : league === 'DEL' ? 0.895 : 0.89;
  let sv = priorSv * 8;
  let gp = 8;
  for (const s of goalieStats.get(id) ?? []) {
    if (!s.gp || !s.sv) continue;
    // The current season is still a small sample: it counts a bit less than the full last season.
    const w = s.year === 2026 ? 0.6 : 1;
    sv += (s.sv + SV_ADJUST[s.league]) * s.gp * w;
    gp += s.gp * w;
  }
  const ovr = 72 + ((sv / gp) - 0.905) * 600;
  return Math.round(clamp(ovr, 50, 86));
}

function gpLastSeason(id) {
  let gp = 0;
  let found = false;
  for (const s of [...(skaterStats.get(id) ?? []), ...(goalieStats.get(id) ?? [])]) {
    if (s.year !== 2025) continue;
    gp += s.gp;
    found = true;
  }
  return found ? gp : undefined;
}

function potentialFor(ovr, age) {
  const gain = age <= 18 ? 16 : age <= 20 ? 11 : age <= 22 ? 7 : age <= 24 ? 4 : age <= 26 ? 1 : 0;
  return Math.min(92, ovr + gain);
}

const SALARY_CAP = 113_500_000;
// DEL ratings span roughly 60–83, the game's salary curve 60–90: stretch the OVR so the best DEL players
// earn like stars and the payrolls (and the expansion cap corridor) are reachable.
const SALARY_STRETCH = 1.2;

/** Fictional in-game salary (the game's own market value formula on the stretched OVR). */
function salaryFor(ovr, age, position) {
  const top = SALARY_CAP * 0.2 * 0.6;
  const eff = 60 + (ovr - 60) * SALARY_STRETCH;
  let v = MIN_SALARY + Math.pow(Math.max(0, eff - 60) / 30, 2.2) * top;
  if (position === 'G') v *= 0.85;
  if (age >= 35) v *= 0.7;
  else if (age >= 32) v *= 0.85;
  return Math.round(v / 25_000) * 25_000;
}

const teamBySlug = new Map(TEAMS.map((t) => [t[0], t]));
const parentOf = new Map(); // player id -> team slug of the non-loan entry
for (const c of roster) if (c[8] !== 'Loan' && c[2]) parentOf.set(c[2], c[1]);

const players = [];
const seen = new Set();
for (const [league, slug, id, nameRaw, ageStr, , nation, shoots, ctrct] of roster) {
  const team = teamBySlug.get(slug);
  if (!team) {
    warnings.push(`Unbekanntes Team ${slug}`);
    continue;
  }
  // A loaned player is listed at both clubs; keep him at his parent club.
  if (ctrct === 'Loan' && parentOf.has(id) && parentOf.get(id) !== slug) continue;
  if (id && seen.has(id)) continue;
  if (id) seen.add(id);
  const m = nameRaw.match(/^(.*?)\s*\(([^)]*)\)/);
  if (!m) {
    warnings.push(`Name nicht lesbar: ${nameRaw}`);
    continue;
  }
  const fullName = m[1].trim();
  const position = POS[m[2].split('/')[0]];
  if (!position) {
    warnings.push(`${slug}: unbekannte Position "${m[2]}" bei ${fullName}`);
    continue;
  }
  const parts = fullName.split(' ');
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ') || parts[0];
  const age = Number(ageStr);
  let ovr = position === 'G' ? goalieOvr(id, age, nation, league) : skaterOvr(id, position, age, nation, league);
  const ov = overrides.get(id) ?? overrides.get(fullName);
  if (ov !== undefined) ovr = ov;
  const end = /^(\d\d)\/(\d\d)$/.exec(ctrct ?? '');
  // The game season is 2026-27: a contract running through 26/27 has one season left.
  const yearsLeft = end ? clamp(Number(end[2]) - 26, 1, 8) : 1;
  const junior = ctrct === 'Junior';
  const gpLast = gpLastSeason(id);
  const prospect = junior || (age <= 19 && !gpLast);
  const elc = age <= 22 && yearsLeft <= 3 && ovr < 70;
  players.push({
    firstName,
    lastName,
    team: team[1],
    position,
    age,
    ...(nation ? { nationality: nation } : {}),
    ...(shoots === 'L' || shoots === 'R' ? { shoots } : {}),
    ovr,
    potential: potentialFor(ovr, age),
    contract: {
      capHit: elc ? MIN_SALARY : Math.max(MIN_SALARY, salaryFor(ovr, age, position)),
      yearsLeft,
      elc,
      twoWay: prospect,
    },
    proYears: Math.max(0, Math.min(age - 18, gpLast === undefined && age <= 20 ? 0 : 12)),
    ...(gpLast !== undefined ? { gpLastSeason: gpLast } : {}),
    farm: prospect,
  });
}

// Every team needs at least 12 F, 6 D and 2 G on the active roster: promote the best prospects if short.
const NEED = { F: 12, D: 6, G: 2 };
const group = (p) => (p.position === 'D' ? 'D' : p.position === 'G' ? 'G' : 'F');
for (const [, abbrev] of TEAMS) {
  const own = players.filter((p) => p.team === abbrev);
  for (const g of ['F', 'D', 'G']) {
    let active = own.filter((p) => !p.farm && group(p) === g).length;
    const pool = own.filter((p) => p.farm && group(p) === g).sort((a, b) => b.ovr - a.ovr);
    while (active < NEED[g] && pool.length) {
      pool.shift().farm = false;
      active++;
    }
    if (active < NEED[g]) warnings.push(`${abbrev}: nur ${active} ${g} im Kader`);
  }
  // Stay under the cap: scale down everything above the minimum salary if a team is too expensive.
  const limit = SALARY_CAP * 0.97;
  const payroll = own.reduce((s, p) => s + p.contract.capHit, 0);
  if (payroll > limit) {
    const fixed = own.filter((p) => p.contract.capHit <= MIN_SALARY).reduce((s, p) => s + p.contract.capHit, 0);
    const factor = (limit - fixed) / (payroll - fixed);
    for (const p of own)
      if (p.contract.capHit > MIN_SALARY) p.contract.capHit = Math.max(MIN_SALARY, Math.floor((p.contract.capHit * factor) / 25_000) * 25_000);
  }
}

const teams = TEAMS.map(([, abbrev, city, name, conference, division, primaryColor, secondaryColor, lat, lon]) => ({
  abbrev,
  city,
  name,
  conference,
  division,
  primaryColor,
  secondaryColor,
  lat,
  lon,
}));
const out = {
  format: 'team33-league',
  version: 1,
  name: 'DEL & DEL2 – inoffizielle Kader 2026/27 (Quelle: eliteprospects.com; Ratings aus Statistiken, Gehälter fiktiv)',
  // DEL and DEL2 are separate tiers: realignment must not move clubs between them.
  config: { seasonStartYear: 2026, seasonLabel: '2026-27', fixedConferences: true },
  teams,
  players,
};
writeFileSync('private-data/del-league.json', JSON.stringify(out, null, 1), 'utf8');
console.log(`${teams.length} Teams, ${players.length} Spieler → private-data/del-league.json`);
for (const w of warnings) console.log('WARN', w);
