/** Fictional franchises in real North American cities, plus the expansion candidates. */

import type { CityProfile } from '../model';

export interface ExistingTeamDef {
  city: string;
  name: string;
  abbrev: string;
  primary: string;
  secondary: string;
  lat: number;
  lon: number;
  conference: string;
  division: string;
}

export const CONFERENCES = ['Eastern', 'Western'] as const;
export const DIVISIONS: { name: string; conference: string }[] = [
  { name: 'Atlantic', conference: 'Eastern' },
  { name: 'Liberty', conference: 'Eastern' },
  { name: 'Prairie', conference: 'Western' },
  { name: 'Pacific', conference: 'Western' },
];

export const EXISTING_TEAMS: ExistingTeamDef[] = [
  { city: 'Boston', name: 'Harborhawks', abbrev: 'BOS', primary: '#1f3a5f', secondary: '#d4a017', lat: 42.36, lon: -71.06, conference: 'Eastern', division: 'Atlantic' },
  { city: 'Buffalo', name: 'Blizzard', abbrev: 'BUF', primary: '#14306b', secondary: '#9fc5e8', lat: 42.89, lon: -78.88, conference: 'Eastern', division: 'Atlantic' },
  { city: 'Detroit', name: 'Ironmen', abbrev: 'DET', primary: '#7a1020', secondary: '#c0c0c0', lat: 42.33, lon: -83.05, conference: 'Eastern', division: 'Atlantic' },
  { city: 'Montréal', name: 'Aurores', abbrev: 'MTL', primary: '#5b1a8b', secondary: '#f2c14e', lat: 45.5, lon: -73.57, conference: 'Eastern', division: 'Atlantic' },
  { city: 'Ottawa', name: 'Sentries', abbrev: 'OTT', primary: '#2d2d2d', secondary: '#c8102e', lat: 45.42, lon: -75.7, conference: 'Eastern', division: 'Atlantic' },
  { city: 'Toronto', name: 'Northmen', abbrev: 'TOR', primary: '#0b3d2e', secondary: '#e8e3d3', lat: 43.65, lon: -79.38, conference: 'Eastern', division: 'Atlantic' },
  { city: 'Tampa', name: 'Tarpons', abbrev: 'TPA', primary: '#0e7c86', secondary: '#f28c28', lat: 27.95, lon: -82.46, conference: 'Eastern', division: 'Atlantic' },
  { city: 'Miami', name: 'Barracudas', abbrev: 'MIA', primary: '#e63e6d', secondary: '#1b998b', lat: 25.76, lon: -80.19, conference: 'Eastern', division: 'Atlantic' },
  { city: 'New York', name: 'Knights', abbrev: 'NYK', primary: '#1d2a5b', secondary: '#b3b3b3', lat: 40.75, lon: -73.99, conference: 'Eastern', division: 'Liberty' },
  { city: 'Newark', name: 'Ironbound', abbrev: 'NWK', primary: '#3d3d3d', secondary: '#f26522', lat: 40.74, lon: -74.17, conference: 'Eastern', division: 'Liberty' },
  { city: 'Long Island', name: 'Mariners', abbrev: 'LIM', primary: '#00507a', secondary: '#f5f0e1', lat: 40.72, lon: -73.59, conference: 'Eastern', division: 'Liberty' },
  { city: 'Philadelphia', name: 'Liberty', abbrev: 'PHI', primary: '#8b1e3f', secondary: '#dcb239', lat: 39.95, lon: -75.17, conference: 'Eastern', division: 'Liberty' },
  { city: 'Pittsburgh', name: 'Foundry', abbrev: 'PIT', primary: '#222222', secondary: '#c9a227', lat: 40.44, lon: -80.0, conference: 'Eastern', division: 'Liberty' },
  { city: 'Washington', name: 'Sentinels', abbrev: 'WSH', primary: '#14213d', secondary: '#d62828', lat: 38.9, lon: -77.04, conference: 'Eastern', division: 'Liberty' },
  { city: 'Raleigh', name: 'Thunder', abbrev: 'RAL', primary: '#4a0e0e', secondary: '#e0e0e0', lat: 35.78, lon: -78.64, conference: 'Eastern', division: 'Liberty' },
  { city: 'Columbus', name: 'Pioneers', abbrev: 'CLB', primary: '#1c3f7a', secondary: '#b22234', lat: 39.96, lon: -83.0, conference: 'Eastern', division: 'Liberty' },
  { city: 'Chicago', name: 'Gales', abbrev: 'CHI', primary: '#0f4c81', secondary: '#e4002b', lat: 41.88, lon: -87.63, conference: 'Western', division: 'Prairie' },
  { city: 'St. Louis', name: 'Riverhawks', abbrev: 'STL', primary: '#123c69', secondary: '#f5b700', lat: 38.63, lon: -90.2, conference: 'Western', division: 'Prairie' },
  { city: 'St. Paul', name: 'Lumberjacks', abbrev: 'STP', primary: '#204e2a', secondary: '#c28a3a', lat: 44.95, lon: -93.09, conference: 'Western', division: 'Prairie' },
  { city: 'Nashville', name: 'Outlaws', abbrev: 'NSH', primary: '#2b2d42', secondary: '#f4a259', lat: 36.16, lon: -86.78, conference: 'Western', division: 'Prairie' },
  { city: 'Dallas', name: 'Wranglers', abbrev: 'DAL', primary: '#005f56', secondary: '#c0c0c0', lat: 32.78, lon: -96.8, conference: 'Western', division: 'Prairie' },
  { city: 'Denver', name: 'Peaks', abbrev: 'DEN', primary: '#4b2142', secondary: '#7fb7be', lat: 39.74, lon: -104.99, conference: 'Western', division: 'Prairie' },
  { city: 'Winnipeg', name: 'Frost', abbrev: 'WPG', primary: '#0a2342', secondary: '#a8dadc', lat: 49.9, lon: -97.14, conference: 'Western', division: 'Prairie' },
  { city: 'Salt Lake City', name: 'Summit', abbrev: 'SLC', primary: '#3a506b', secondary: '#f0e6d2', lat: 40.76, lon: -111.89, conference: 'Western', division: 'Prairie' },
  { city: 'Calgary', name: 'Ranchers', abbrev: 'CGY', primary: '#a4161a', secondary: '#ffba08', lat: 51.05, lon: -114.07, conference: 'Western', division: 'Pacific' },
  { city: 'Edmonton', name: 'Prospectors', abbrev: 'EDM', primary: '#1b3b6f', secondary: '#f77f00', lat: 53.55, lon: -113.49, conference: 'Western', division: 'Pacific' },
  { city: 'Vancouver', name: 'Orcas', abbrev: 'VAN', primary: '#00334e', secondary: '#4ecdc4', lat: 49.28, lon: -123.12, conference: 'Western', division: 'Pacific' },
  { city: 'Seattle', name: 'Sockeyes', abbrev: 'SEA', primary: '#0b3954', secondary: '#ff5a5f', lat: 47.61, lon: -122.33, conference: 'Western', division: 'Pacific' },
  { city: 'San Jose', name: 'Quakes', abbrev: 'SJQ', primary: '#264653', secondary: '#e9c46a', lat: 37.34, lon: -121.89, conference: 'Western', division: 'Pacific' },
  { city: 'Los Angeles', name: 'Comets', abbrev: 'LAC', primary: '#1a1a2e', secondary: '#e94560', lat: 34.05, lon: -118.24, conference: 'Western', division: 'Pacific' },
  { city: 'Anaheim', name: 'Surf', abbrev: 'ANA', primary: '#03045e', secondary: '#ff9f1c', lat: 33.84, lon: -117.91, conference: 'Western', division: 'Pacific' },
  { city: 'Las Vegas', name: 'High Rollers', abbrev: 'LVR', primary: '#2c2c34', secondary: '#c5a880', lat: 36.17, lon: -115.14, conference: 'Western', division: 'Pacific' },
];

export const EXPANSION_CITIES: CityProfile[] = [
  { id: 'houston', city: 'Houston', region: 'Texas', lat: 29.76, lon: -95.37, marketSize: 9, tradition: 3, arenaCapacity: 17800, taxAdvantage: 9, travelLoad: 6, blurb: 'Riesiger Markt ohne State Income Tax, aber Eishockey muss sich erst gegen Football und Basketball behaupten.' },
  { id: 'austin', city: 'Austin', region: 'Texas', lat: 30.27, lon: -97.74, marketSize: 7, tradition: 2, arenaCapacity: 16800, taxAdvantage: 9, travelLoad: 6, blurb: 'Junge, wachsende Tech-Stadt mit steuerlichem Vorteil – Fans müssen erst gewonnen werden.' },
  { id: 'atlanta', city: 'Atlanta', region: 'Georgia', lat: 33.75, lon: -84.39, marketSize: 8, tradition: 3, arenaCapacity: 17500, taxAdvantage: 5, travelLoad: 5, blurb: 'Großer Medienmarkt im Süden mit wechselhafter Hockey-Vergangenheit.' },
  { id: 'quebec', city: 'Quebec City', region: 'Québec', lat: 46.81, lon: -71.21, marketSize: 4, tradition: 10, arenaCapacity: 18250, taxAdvantage: 2, travelLoad: 4, blurb: 'Hockey ist hier Religion. Volle Halle garantiert – aber hohe Steuern schrecken Free Agents ab.' },
  { id: 'hartford', city: 'Hartford', region: 'Connecticut', lat: 41.76, lon: -72.68, marketSize: 4, tradition: 7, arenaCapacity: 15600, taxAdvantage: 4, travelLoad: 2, blurb: 'Treue Basis im Nordosten, kurze Reisen – aber kleine Halle und begrenzter Markt.' },
  { id: 'kansascity', city: 'Kansas City', region: 'Missouri', lat: 39.1, lon: -94.58, marketSize: 6, tradition: 4, arenaCapacity: 17500, taxAdvantage: 5, travelLoad: 5, blurb: 'Zentrale Lage, moderne Arena und solides Sportpublikum.' },
  { id: 'milwaukee', city: 'Milwaukee', region: 'Wisconsin', lat: 43.04, lon: -87.91, marketSize: 5, tradition: 6, arenaCapacity: 17300, taxAdvantage: 4, travelLoad: 3, blurb: 'Kaltes Klima, ehrliche Sportstadt, starke College-Hockey-Szene in der Region.' },
  { id: 'portland', city: 'Portland', region: 'Oregon', lat: 45.52, lon: -122.68, marketSize: 6, tradition: 6, arenaCapacity: 18000, taxAdvantage: 4, travelLoad: 7, blurb: 'Junior-Hockey-Tradition und leidenschaftliche Fans, dafür lange Reisen im Westen.' },
  { id: 'sandiego', city: 'San Diego', region: 'Kalifornien', lat: 32.72, lon: -117.16, marketSize: 7, tradition: 4, arenaCapacity: 17000, taxAdvantage: 2, travelLoad: 7, blurb: 'Lebensqualität lockt Spieler – die kalifornische Steuer weniger.' },
  { id: 'hamilton', city: 'Hamilton', region: 'Ontario', lat: 43.26, lon: -79.87, marketSize: 5, tradition: 9, arenaCapacity: 17000, taxAdvantage: 2, travelLoad: 2, blurb: 'Hockey-Herzland mit kurzen Wegen, aber im Schatten eines großen Nachbarn.' },
  { id: 'cleveland', city: 'Cleveland', region: 'Ohio', lat: 41.5, lon: -81.69, marketSize: 6, tradition: 5, arenaCapacity: 18500, taxAdvantage: 4, travelLoad: 3, blurb: 'Solider Markt mit großer Arena und Rivalitäten direkt vor der Haustür.' },
  { id: 'omaha', city: 'Omaha', region: 'Nebraska', lat: 41.26, lon: -95.93, marketSize: 4, tradition: 5, arenaCapacity: 16000, taxAdvantage: 5, travelLoad: 5, blurb: 'Kleiner Markt mit College-Hockey-Begeisterung und günstigen Kosten.' },
];

/** Ids of the generic logo icons (the UI maps them to SVG paths). */
export const LOGO_ICONS = ['star', 'bolt', 'mountain', 'wave', 'crown', 'flame', 'snowflake', 'anchor', 'pine', 'sticks', 'puck', 'arrow'] as const;
export const LOGO_SHAPES = ['shield', 'circle', 'hexagon', 'diamond', 'square'] as const;

export const EXPANSION_NAME_IDEAS = ['Stingers', 'Bluejacks', 'Wildcats', 'Comets', 'Glaciers', 'Huskies', 'Blades', 'Sentinels', 'Pioneers', 'Storm'];
