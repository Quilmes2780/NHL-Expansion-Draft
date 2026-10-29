/** Public engine API. The engine has no UI dependencies and is fully deterministic per seed. */

export * from './config';
export * from './model';
export * from './rng';
export * from './value';
export * from './franchise';
export { generateLeague, rosterCounts } from './gen/league';
export { EXPANSION_CITIES, EXISTING_TEAMS } from './data/cities';
export { NATIONS } from './data/names';
export * from './expansion/eligibility';
