// Builds private-data/nhl-league.json (format "team33-league" v1) from the per-team text files in
// private-data/nhl/<ABBR>.txt. Each line: Name;Pos;Age;CapHit;SeasonsLeft;Status;Clause;Level[;OVR]
//   SeasonsLeft counts the current season 2026-27 (the game starts in 2027-28, so yearsLeft = SeasonsLeft - 1).
//   Level: NHL | AHL | IR. OVR is an estimate (optional; minor leaguers get a formula value).
// Usage: node scripts/build-nhl-league.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TEAMS = [
  ['BOS', 'Boston', 'Bruins', 'Eastern', 'Atlantic', '#FFB81C', '#111111', 42.37, -71.06],
  ['BUF', 'Buffalo', 'Sabres', 'Eastern', 'Atlantic', '#003087', '#FFB81C', 42.88, -78.88],
  ['DET', 'Detroit', 'Red Wings', 'Eastern', 'Atlantic', '#CE1126', '#FFFFFF', 42.34, -83.06],
  ['FLA', 'Florida', 'Panthers', 'Eastern', 'Atlantic', '#C8102E', '#041E42', 26.16, -80.33],
  ['MTL', 'Montréal', 'Canadiens', 'Eastern', 'Atlantic', '#AF1E2D', '#192168', 45.5, -73.57],
  ['OTT', 'Ottawa', 'Senators', 'Eastern', 'Atlantic', '#C52032', '#000000', 45.3, -75.93],
  ['TBL', 'Tampa Bay', 'Lightning', 'Eastern', 'Atlantic', '#002868', '#FFFFFF', 27.94, -82.45],
  ['TOR', 'Toronto', 'Maple Leafs', 'Eastern', 'Atlantic', '#00205B', '#FFFFFF', 43.64, -79.38],
  ['CAR', 'Carolina', 'Hurricanes', 'Eastern', 'Metropolitan', '#CE1126', '#000000', 35.8, -78.72],
  ['CBJ', 'Columbus', 'Blue Jackets', 'Eastern', 'Metropolitan', '#002654', '#CE1126', 39.97, -83.01],
  ['NJD', 'New Jersey', 'Devils', 'Eastern', 'Metropolitan', '#CE1126', '#000000', 40.73, -74.17],
  ['NYI', 'New York', 'Islanders', 'Eastern', 'Metropolitan', '#00539B', '#F47D30', 40.71, -73.73],
  ['NYR', 'New York', 'Rangers', 'Eastern', 'Metropolitan', '#0038A8', '#CE1126', 40.75, -73.99],
  ['PHI', 'Philadelphia', 'Flyers', 'Eastern', 'Metropolitan', '#F74902', '#000000', 39.9, -75.17],
  ['PIT', 'Pittsburgh', 'Penguins', 'Eastern', 'Metropolitan', '#000000', '#FCB514', 40.44, -79.99],
  ['WSH', 'Washington', 'Capitals', 'Eastern', 'Metropolitan', '#C8102E', '#041E42', 38.9, -77.02],
  ['CHI', 'Chicago', 'Blackhawks', 'Western', 'Central', '#CF0A2C', '#000000', 41.88, -87.67],
  ['COL', 'Colorado', 'Avalanche', 'Western', 'Central', '#6F263D', '#236192', 39.75, -105.01],
  ['DAL', 'Dallas', 'Stars', 'Western', 'Central', '#006847', '#8F8F8C', 32.79, -96.81],
  ['MIN', 'Minnesota', 'Wild', 'Western', 'Central', '#154734', '#A6192E', 44.94, -93.1],
  ['NSH', 'Nashville', 'Predators', 'Western', 'Central', '#FFB81C', '#041E42', 36.16, -86.78],
  ['STL', 'St. Louis', 'Blues', 'Western', 'Central', '#002F87', '#FCB514', 38.63, -90.2],
  ['UTA', 'Utah', 'Mammoth', 'Western', 'Central', '#71AFE5', '#090909', 40.77, -111.9],
  ['WPG', 'Winnipeg', 'Jets', 'Western', 'Central', '#041E42', '#AC162C', 49.89, -97.14],
  ['ANA', 'Anaheim', 'Ducks', 'Western', 'Pacific', '#F47A38', '#111111', 33.81, -117.88],
  ['CGY', 'Calgary', 'Flames', 'Western', 'Pacific', '#C8102E', '#F1BE48', 51.04, -114.05],
  ['EDM', 'Edmonton', 'Oilers', 'Western', 'Pacific', '#041E42', '#FF4C00', 53.55, -113.5],
  ['LAK', 'Los Angeles', 'Kings', 'Western', 'Pacific', '#111111', '#A2AAAD', 34.04, -118.27],
  ['SJS', 'San Jose', 'Sharks', 'Western', 'Pacific', '#006D75', '#EA7200', 37.33, -121.9],
  ['SEA', 'Seattle', 'Kraken', 'Western', 'Pacific', '#001628', '#99D9D9', 47.62, -122.35],
  ['VAN', 'Vancouver', 'Canucks', 'Western', 'Pacific', '#00205B', '#00843D', 49.28, -123.11],
  ['VGK', 'Vegas', 'Golden Knights', 'Western', 'Pacific', '#B4975A', '#333F42', 36.1, -115.18],
];

const POS = { C: 'C', LW: 'LW', RW: 'RW', LD: 'D', RD: 'D', D: 'D', G: 'G', F: 'C', W: 'RW' };
const warnings = [];

/** Formula OVR for players without an estimate (mostly minor leaguers). */
function formulaOvr(capHit, age, level) {
  const m = capHit / 1e6;
  let ovr = level === 'AHL' ? 58 : 64;
  if (m >= 1) ovr += Math.min(14, Math.log2(m) * 5 + 3);
  if (age <= 21) ovr -= 3;
  return Math.round(Math.max(45, Math.min(82, ovr)));
}

function potentialFor(ovr, age) {
  const gain = age <= 19 ? 14 : age <= 21 ? 9 : age <= 23 ? 5 : age <= 25 ? 2 : 0;
  return Math.min(96, ovr + gain);
}

// Cap hits from 2027-28 on (extensions that start after the current season).
const extensions = new Map();
if (existsSync('private-data/nhl/_extensions.txt')) {
  for (const raw of readFileSync('private-data/nhl/_extensions.txt', 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [abbr, nm, cap] = line.split(';').map((s) => s.trim());
    extensions.set(`${abbr};${nm}`, Number(cap));
  }
}
const usedExtensions = new Set();

const players = [];
const teams = [];
for (const [abbrev, city, name, conference, division, primaryColor, secondaryColor, lat, lon] of TEAMS) {
  teams.push({ abbrev, city, name, conference, division, primaryColor, secondaryColor, lat, lon });
  const file = `private-data/nhl/${abbrev}.txt`;
  if (!existsSync(file)) {
    warnings.push(`${abbrev}: Datei fehlt`);
    continue;
  }
  const seen = new Set();
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [nm, pos, age, cap, left, status, clause, level, ovrStr] = line.split(';').map((s) => s?.trim());
    // Name + position: two different players can share a name (e.g. Elias Pettersson C/D in Vancouver).
    const key = `${nm};${pos}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const position = POS[(pos ?? '').split(/[ ,/]/)[0].toUpperCase()];
    if (!position) {
      warnings.push(`${abbrev}: unbekannte Position "${pos}" bei ${nm}`);
      continue;
    }
    // Names come as "Last, First" (CapWages) or "First Last".
    const [firstName, lastName] = nm.includes(',')
      ? [nm.split(',')[1].trim(), nm.split(',')[0].trim()]
      : [nm.split(' ')[0], nm.split(' ').slice(1).join(' ') || nm];
    const seasonsLeftNow = Number(left);
    const ext = seasonsLeftNow >= 2 ? extensions.get(`${abbrev};${nm}`) : undefined;
    if (ext !== undefined) usedExtensions.add(`${abbrev};${nm}`);
    const capHit = Math.round(ext ?? Number(cap));
    const seasonsLeft = Number(left);
    // The game starts one season later (2027-28): ages +1, one contract season used up.
    const ageNext = Number(age) + 1;
    const yearsLeft = Math.max(0, Math.min(8, seasonsLeft - 1));
    const lvl = (level ?? 'NHL').toUpperCase();
    const ovr = ovrStr ? Number(ovrStr) : formulaOvr(capHit, ageNext, lvl);
    const elc = capHit <= 1_000_000 && ageNext <= 24 && status === 'RFA' && ext === undefined;
    players.push({
      firstName,
      lastName,
      team: abbrev,
      position,
      age: ageNext,
      ovr,
      potential: potentialFor(ovr, ageNext),
      contract: {
        capHit,
        yearsLeft,
        expiryStatus: status === 'RFA' ? 'RFA' : 'UFA',
        nmc: /NMC/i.test(clause ?? ''),
        ntc: /NTC/i.test(clause ?? ''),
        elc,
        twoWay: lvl === 'AHL' && capHit < 1_000_000,
      },
      proYears: elc ? Math.max(0, Math.min(3, ageNext - 20)) : Math.max(3, ageNext - 20),
      farm: lvl === 'AHL',
    });
  }
}

const out = {
  format: 'team33-league',
  version: 1,
  name: 'NHL – inoffizielle Kader (Stand Oktober 2026, Quelle: CapWages; Ratings geschätzt)',
  teams,
  players,
};
writeFileSync('private-data/nhl-league.json', JSON.stringify(out, null, 1), 'utf8');
for (const k of extensions.keys()) if (!usedExtensions.has(k)) warnings.push(`Verlängerung nicht zugeordnet: ${k}`);
console.log(`${teams.length} Teams, ${players.length} Spieler, ${usedExtensions.size} Verlängerungen → private-data/nhl-league.json`);
for (const w of warnings) console.log('WARN', w);
