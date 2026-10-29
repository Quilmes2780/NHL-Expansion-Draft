# Team 33 – Expansion Draft GM

Browserbasiertes Single-Player-Managementspiel: Du gründest das 33. Franchise einer fiktiven, NHL-ähnlichen Liga
und baust deinen Kader über einen regelkonformen Expansion Draft auf. Alle Teams, Spieler und Namen sind prozedural
generiert – keine echten Logos, Marken oder Spieler.

**Stand:** Meilensteine M1–M3 (Liga-Generator, Regel-Engine, Draft-UI). Offseason, Saison und Playoffs folgen (siehe [PLAN.md](PLAN.md)).

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Vitest (Engine-Tests)
npm run build      # Typecheck + statisches Bundle in dist/
```

`npm run build` erzeugt eine einzige, vollständig inline gebaute `dist/index.html`. Sie läuft offline – auch direkt per
Doppelklick (`file://`), ohne Server.

## Spielablauf (aktueller Stand)

1. **Neue Liga:** Seed, Regelset (Seattle 2021 / Vegas 2017 / Custom mit frei einstellbaren Parametern), Schwierigkeit
   (bestimmt das Scouting-Budget).
2. **Franchise-Gründung:** 12 Städte mit Marktgröße, Tradition, Arena, Steuervorteil und Reisebelastung; Teamname,
   Kürzel, Farben, SVG-Logo-Baukasten; Owner-Mandat. Die Divisionen werden geografisch neu eingeteilt.
3. **Schutzlisten-Reveal:** 32 KI-GMs schützen nach Wert, Alter, Vertrag, Cap und Persönlichkeit; Analysten
   kommentieren Überraschungen.
4. **Draft Board:** alle exponierten Spieler mit Filter/Sortierung, Wunschliste, Vergleich (bis 3), Spielerkarte,
   Fog-of-War-Scouting und permanentem Constraint-Tracker mit Ampeln. Ungültige Listen werden mit präziser
   Regelangabe abgelehnt.
5. **Draft-Abend:** animierte Verkündung, Noten A–F pro Pick, Gesamtnote.
6. **Bilanz:** Vergleich mit dem KI-Mock-Draft („Was die KI gewählt hätte“), beste Picks, verpasste Chancen.

## Architektur

```
src/
  engine/          reine TypeScript-Spiellogik, keine UI-Abhängigkeiten
    rng.ts         geseedeter PRNG (sfc32 + cyrb128), Sub-Streams via rngFor(seed, ...keys)
    config.ts      LeagueConfig + Regelsets (alle Ligaparameter zentral)
    model.ts       Datenmodell (Player, Contract, Team, DraftPick, League …)
    value.ts       OVR-Formel, Marktwert, Projektion, Vertrags-Surplus
    franchise.ts   Franchise-Gründung, geografische Neueinteilung
    gen/           Spieler- und Liga-Generator
    data/          Städte, Namenspools
    expansion/     Eligibility, Schutzlisten (Validierung + KI), Auswahl-Validierung,
                   Constraint-Tracker, Mock-Draft, Noten, Scouting, Analysten, Draft-State
  store/           Zustand-Store (dünne Hülle um Engine-Aufrufe)
  ui/              React-Komponenten und Screens (Tailwind)
```

- **Determinismus:** Die Engine nutzt ausschließlich den geseedeten PRNG. Ein Architekturtest verbietet
  `Math.random`, `Date.now`, DOM-Zugriffe sowie React/Zustand-Imports in `src/engine/`.
  Gleicher Seed + gleiche Entscheidungen ⇒ identischer Zustand (per Test geprüft).
- **Sub-Streams:** Jede Domäne (Team-Generierung, Logos, Schutz-KI, Scouting je Spieler) hat einen eigenen Stream,
  sodass z. B. zusätzliches Scouting keine anderen Zufallsergebnisse verschiebt.

## Datenmodell (Kurzfassung)

| Typ | Wichtige Felder |
|---|---|
| `Player` | `id`, Name, `age`, `nationality`, `position` (C/LW/RW/D/G), `shoots`, `skater` *oder* `goalie` (Attribute 25–99), `ovr`, `potential`, `contract`, `proYears`, `gpLastSeason`, `gpLastTwo`, `lastSeason`, `morale`, `form`, `injury`, `seasonStats`, `teamId`, `farm` |
| `Contract` | `capHit` ($), `yearsLeft` (ab kommender Saison; 0 = pending FA), `expiryStatus` (UFA/RFA), `nmc`, `ntc`, `nmcWaived`, `elc`, `twoWay` |
| `Team` | `id`, `city`, `name`, `abbrev`, `colors`, `logo`, `conference`, `division`, `lat/lon`, `personality` (rebuild/contender/capStrapped), `gmName`, `isExpansion` |
| `DraftPick` | `year`, `round`, `originalTeamId`, `ownerTeamId` |
| `League` | `seed`, `config`, `teams`, `players` (Map nach id), `picks`, `divisions`, `franchise` |

Attribute Feldspieler: Skating, Shooting, Passing, Puck Handling, Defense, Physical, Hockey IQ.
Goalies: Reflexes, Positioning, Rebound Control, Puck Handling. Der OVR ist ein positionsabhängig gewichtetes Mittel.

Konventionen: Ein Spieler mit `contract === null` ist ein ungesignter Draftpick. „Vertrag für die nächste Saison“
heißt `contract.yearsLeft >= 1`. Payroll = Summe der Cap Hits aller aktiven Spieler mit Vertrag für die nächste Saison.

## Regeln Expansion Draft (Seattle 2021, Standard)

- Schutz: 7 F + 3 D + 1 G **oder** 8 Feldspieler + 1 G. NMC-Spieler (ohne Verzicht) müssen geschützt werden.
- Ausgenommen: 1. und 2. Profijahr, ungesignte Draftpicks.
- Mindest-Exposure je Team: ≥ 1 D und ≥ 2 F mit Vertrag für die nächste Saison und ≥ 40 Spielen in der Vorsaison
  oder ≥ 70 in den letzten zwei; ≥ 1 G mit Vertrag oder als pending RFA. Der Generator garantiert die Erfüllbarkeit.
- Expansionsteam: genau 1 Spieler pro Team, ≥ 14 F, ≥ 9 D, ≥ 3 G, ≥ 20 unter Vertrag, Cap Hits 60–100 % des Caps.
- Pending UFAs sind nur über das exklusive Verhandlungsfenster verpflichtbar (M4). Pending RFAs sind wählbar, zählen
  nicht zu den 20 Verträgen; ihr Cap Hit wird mit dem bisherigen Wert angesetzt.

## Vereinfachungen

Keine Arbitration, Buyouts, LTIR oder Bonus-Overages; Farmteam-Gehälter zählen nicht zur Payroll.

## JSON-Import eigener Ligadaten

Folgt in M8 (Schema wird hier dokumentiert).
