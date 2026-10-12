# Sportradar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Statická, mobilní webová aplikace, kde si uživatel zaklikne oblíbené sporty/týmy (F1, NBA, NHL, česká extraliga, NBL) a vidí, kdy se hraje jejich příští zápas v jeho časovém pásmu a kde ho sledovat.

**Architecture:** Plánovaná úloha (GitHub Actions, cca každou hodinu) spustí `data-pipeline`: pět izolovaných adaptérů stáhne rozvrhy, převede je na jednotný model `Match`/`Team`, sloučí s předchozími daty (selhání nebo 0 zápasů = ponechat stará data) a zapíše `matches.json` a `teams.json` do `web/public/data/`. Statický web (Vite + React) je načte a filtruje na klientovi; oblíbené jsou v localStorage a přenositelné odkazem `#fav=…`.

**Tech Stack:** TypeScript, npm workspaces, Node 22, Vitest, tsx, cheerio, yaml, Vite, React 18. Nasazení: GitHub Pages (GitHub Actions).

**Spec:** `docs/superpowers/specs/2026-10-12-sportradar-design.md`

## Global Constraints

- Web je čistě statický (žádný server), mobile-first; stránka je jedna, bez routeru (přepínání záložek stavem).
- Čas se ukládá jako ISO UTC (`startsAt`), na zobrazení se převádí v prohlížeči přes `Intl.DateTimeFormat`; žádná knihovna na data/čas.
- Oblíbené: localStorage + sdílení v URL hash `#fav=id1,id2`. Žádné účty.
- Data starší než 6 hodin → upozornění ve webu.
- Adaptéry běží izolovaně; chyba adaptéru nebo 0 zápasů nepřepíše jeho poslední dobrá data.
- Žádné živé HTTP požadavky v testech; adaptéry se testují na vložených ukázkách odpovědí.
- „Kde sledovat“ = ručně udržovaný `data-pipeline/broadcasters.yml`; do něj se píšou jen ověřené údaje (s `source` a `checked`).
- Scraping: identifikující `User-Agent`, nízká frekvence (max 1×/hod), žádné obcházení ochran.
- Commit zprávy končí řádkem `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- UI texty česky.

## Review Focus

1. Přechod letního/zimního času (neděle 25. 10. 2026): zápas v Praze těsně po změně musí mít správné UTC — test v Task 2.
2. Web uživatele v jiném časovém pásmu (např. New York) nebo zápas kolem půlnoci: seskupení po dnech podle místního dne, ne UTC — test v Task 10.
3. Scraper dostane změněné HTML (žádné řádky) nebo řádek bez času (odložený zápas): nesmí spadnout, vrátí prázdno / řádek přeskočí, merge ponechá stará data — testy v Task 3, 7, 8.
4. Poškozený localStorage, nesmyslný nebo obrovský `#fav=` hash: ignoruje se, aplikace se nerozbije — test v Task 11.
5. Zápas, který začal před hodinou, se pořád ukáže jako „probíhá“, ale zápas starý > 3 h ne — test v Task 10.

---

## File Structure

```
package.json, tsconfig.base.json, .gitignore, README.md
shared/            src/index.ts                    # typy Match/Team/Sport, SPORT_LABELS
data-pipeline/
  broadcasters.yml
  src/types.ts                                      # Adapter, AdapterResult
  src/util.ts                                       # getText/getJson, slugify, pragueToUtcIso, combine
  src/merge.ts                                      # mergeDatasets
  src/broadcasters.ts                               # applyBroadcasters
  src/adapters/{f1,nhl,nba,nbl,elh}.ts              # parseX + adapter (fetch)
  src/run.ts                                        # orchestrace, zápis JSON
  src/*.test.ts, src/adapters/*.test.ts
web/
  index.html, vite.config.ts, tsconfig.json
  src/lib/{time,schedule,favorites}.ts + testy
  src/{main.tsx,App.tsx,styles.css,useData.ts}
  src/components/{ProgramView,FavoritesView,MatchCard}.tsx
.github/workflows/deploy.yml
```

---

### Task 1: Scaffold monorepa a sdílené typy

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `shared/package.json`, `shared/src/index.ts`, `data-pipeline/package.json`, `data-pipeline/tsconfig.json`, `web/package.json`
- Test: žádný (typový check)

**Interfaces:**
- Produces (`@sportradar/shared`): `Sport`, `SPORTS`, `SPORT_LABELS`, `Broadcaster`, `Match`, `Team`, `MatchesFile`, `TeamsFile`.

- [ ] **Step 1: Root soubory**

`package.json`:
```json
{
  "name": "sportradar",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "data-pipeline", "web"],
  "scripts": {
    "test": "npm test --workspaces --if-present",
    "data": "npm run build:data -w data-pipeline",
    "dev": "npm run dev -w web",
    "build": "npm run build -w web"
  }
}
```
`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true, "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"], "jsx": "react-jsx"
  }
}
```
`.gitignore`:
```
node_modules
dist
web/public/data
*.log
```

- [ ] **Step 2: `shared`**

`shared/package.json`:
```json
{ "name": "@sportradar/shared", "private": true, "type": "module", "main": "src/index.ts", "types": "src/index.ts" }
```
`shared/src/index.ts`:
```ts
export type Sport = 'f1' | 'nba' | 'nhl' | 'cz-hockey' | 'cz-basket';
export const SPORTS: Sport[] = ['f1', 'nhl', 'nba', 'cz-hockey', 'cz-basket'];
export const SPORT_LABELS: Record<Sport, string> = {
  f1: 'Formule 1',
  nhl: 'NHL',
  nba: 'NBA',
  'cz-hockey': 'Česká extraliga',
  'cz-basket': 'Česká NBL',
};

export interface Broadcaster { name: string; url?: string }

export interface Match {
  id: string;            // globálně unikátní, např. "nhl:2026020084"
  sport: Sport;
  competition: string;   // "NHL", "Formule 1"…
  startsAt: string;      // ISO 8601 v UTC (…Z)
  title: string;         // "Domácí – Hosté" / "GP Monaka – Závod"
  teams: string[];       // id týmů, např. ["nhl:PIT","nhl:WSH"]; F1: []
  broadcasters: Broadcaster[];
}

export interface Team { id: string; sport: Sport; name: string }
export interface MatchesFile { generatedAt: string; matches: Match[] }
export interface TeamsFile { teams: Team[] }
```

- [ ] **Step 3: Pipeline a web package.json**

`data-pipeline/package.json`:
```json
{
  "name": "data-pipeline", "private": true, "type": "module",
  "scripts": { "test": "vitest run", "build:data": "tsx src/run.ts", "typecheck": "tsc -p ." }
}
```
`data-pipeline/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```
`web/package.json`:
```json
{
  "name": "web", "private": true, "type": "module",
  "scripts": { "dev": "vite", "build": "tsc -p . && vite build", "preview": "vite preview", "test": "vitest run" }
}
```

- [ ] **Step 4: Instalace závislostí**

```bash
npm install -D typescript vitest tsx @types/node -w data-pipeline
npm install cheerio yaml @sportradar/shared -w data-pipeline
npm install react react-dom @sportradar/shared -w web
npm install -D vite @vitejs/plugin-react typescript vitest @types/react @types/react-dom -w web
```
Expected: bez chyb; vznikne `package-lock.json`.

- [ ] **Step 5: Git a commit**

```bash
git init -b main
git add .
git commit -m "chore: scaffold monorepo and shared types"
```

---

### Task 2: Utility (HTTP, slug, časová zóna, combine)

**Files:**
- Create: `data-pipeline/src/types.ts`, `data-pipeline/src/util.ts`
- Test: `data-pipeline/src/util.test.ts`

**Interfaces:**
- Produces: `AdapterResult { matches: Match[]; teams: Team[] }`, `Adapter { sport: Sport; fetch(now: Date): Promise<AdapterResult> }`; `UA`, `getText(url, f?)`, `getJson<T>(url, f?)`, `slugify(s)`, `pragueToUtcIso(y,mo,d,h,mi)`, `combine(results: AdapterResult[]): AdapterResult`.

- [ ] **Step 1: Failing test** `data-pipeline/src/util.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { combine, pragueToUtcIso, slugify } from './util';

describe('pragueToUtcIso', () => {
  it('letní čas (CEST, +2)', () => {
    expect(pragueToUtcIso(2026, 10, 10, 12, 0)).toBe('2026-10-10T10:00:00.000Z');
  });
  it('zimní čas (CET, +1)', () => {
    expect(pragueToUtcIso(2026, 11, 1, 18, 0)).toBe('2026-11-01T17:00:00.000Z');
  });
  it('den po přechodu na zimní čas (25. 10. 2026)', () => {
    expect(pragueToUtcIso(2026, 10, 24, 18, 0)).toBe('2026-10-24T16:00:00.000Z');
    expect(pragueToUtcIso(2026, 10, 26, 18, 0)).toBe('2026-10-26T17:00:00.000Z');
  });
});

describe('slugify', () => {
  it('odstraní diakritiku a mezery', () => {
    expect(slugify('BK Olomoucko')).toBe('bk-olomoucko');
    expect(slugify('Ústí nad Labem – Žraloci')).toBe('usti-nad-labem-zraloci');
  });
});

describe('combine', () => {
  it('spojí výsledky a deduplikuje podle id', () => {
    const m = (id: string) => ({ id, sport: 'nhl' as const, competition: 'NHL', startsAt: '2026-10-14T23:00:00.000Z', title: 't', teams: [], broadcasters: [] });
    const t = (id: string) => ({ id, sport: 'nhl' as const, name: id });
    const r = combine([
      { matches: [m('a'), m('b')], teams: [t('x')] },
      { matches: [m('b'), m('c')], teams: [t('x'), t('y')] },
    ]);
    expect(r.matches.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r.teams.map((x) => x.id)).toEqual(['x', 'y']);
  });
});
```

- [ ] **Step 2: Run – fail**

Run: `npm test -w data-pipeline -- src/util.test.ts`
Expected: FAIL (modul `./util` neexistuje).

- [ ] **Step 3: Implementace**

`data-pipeline/src/types.ts`:
```ts
import type { Match, Sport, Team } from '@sportradar/shared';

export interface AdapterResult { matches: Match[]; teams: Team[] }
export interface Adapter { sport: Sport; fetch(now: Date): Promise<AdapterResult> }
```
`data-pipeline/src/util.ts`:
```ts
import type { AdapterResult } from './types';

export const UA = 'sportradar-personal/1.0 (osobni agregator rozvrhu; max 1x/hod)';

export async function getText(url: string, f: typeof fetch = fetch): Promise<string> {
  const r = await f(url, { headers: { 'user-agent': UA, accept: '*/*' } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
}

export async function getJson<T = unknown>(url: string, f: typeof fetch = fetch): Promise<T> {
  return JSON.parse(await getText(url, f)) as T;
}

export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function pragueOffsetMs(ts: number): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Prague', hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(ts));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ts;
}

/** Převede „nástěnný“ čas v Praze na ISO UTC (zvládá přechody DST). */
export function pragueToUtcIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let ts = wall;
  for (let i = 0; i < 2; i++) ts = wall - pragueOffsetMs(ts);
  return new Date(ts).toISOString();
}

export function combine(results: AdapterResult[]): AdapterResult {
  const matches = new Map<string, AdapterResult['matches'][number]>();
  const teams = new Map<string, AdapterResult['teams'][number]>();
  for (const r of results) {
    for (const m of r.matches) if (!matches.has(m.id)) matches.set(m.id, m);
    for (const t of r.teams) if (!teams.has(t.id)) teams.set(t.id, t);
  }
  return { matches: [...matches.values()], teams: [...teams.values()] };
}
```

- [ ] **Step 4: Run – pass**

Run: `npm test -w data-pipeline -- src/util.test.ts`
Expected: PASS (3 describe bloky).

- [ ] **Step 5: Commit**
```bash
git add data-pipeline && git commit -m "feat(pipeline): utils for http, slug, Prague time, combine"
```

---

### Task 3: Merge a ochrana před ztrátou dat

**Files:**
- Create: `data-pipeline/src/merge.ts`
- Test: `data-pipeline/src/merge.test.ts`

**Interfaces:**
- Consumes: `AdapterResult`.
- Produces: `Dataset { matches: Match[]; teams: Team[] }`, `SportOutcome = AdapterResult | Error`, `mergeDatasets(prev: Dataset, outcomes: Partial<Record<Sport, SportOutcome>>, now: Date): Dataset`.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import type { Match, Team } from '@sportradar/shared';
import { mergeDatasets } from './merge';

const now = new Date('2026-10-12T12:00:00Z');
const m = (id: string, sport: Match['sport'], startsAt: string): Match =>
  ({ id, sport, competition: 'c', startsAt, title: id, teams: [], broadcasters: [] });
const t = (id: string, sport: Team['sport']): Team => ({ id, sport, name: id });

const prev = {
  matches: [m('nhl:old', 'nhl', '2026-10-13T00:00:00.000Z'), m('f1:old', 'f1', '2026-10-14T00:00:00.000Z')],
  teams: [t('nhl:A', 'nhl')],
};

describe('mergeDatasets', () => {
  it('čerstvá data nahradí stará pro daný sport', () => {
    const r = mergeDatasets(prev, { nhl: { matches: [m('nhl:new', 'nhl', '2026-10-15T00:00:00.000Z')], teams: [t('nhl:B', 'nhl')] } }, now);
    expect(r.matches.map((x) => x.id)).toEqual(['f1:old', 'nhl:new']);
    expect(r.teams.map((x) => x.id)).toEqual(['nhl:B']);
  });
  it('chyba adaptéru ponechá stará data', () => {
    const r = mergeDatasets(prev, { nhl: new Error('boom') }, now);
    expect(r.matches.map((x) => x.id)).toEqual(['nhl:old', 'f1:old']);
    expect(r.teams.map((x) => x.id)).toEqual(['nhl:A']);
  });
  it('0 zápasů (změněné HTML) ponechá stará data', () => {
    const r = mergeDatasets(prev, { nhl: { matches: [], teams: [] } }, now);
    expect(r.matches.map((x) => x.id)).toContain('nhl:old');
  });
  it('odstraní zápasy starší než 6 h a seřadí podle času', () => {
    const p = { matches: [m('a', 'f1', '2026-10-12T05:00:00.000Z'), m('b', 'f1', '2026-10-12T07:00:00.000Z'), m('c', 'f1', '2026-10-12T06:30:00.000Z')], teams: [] };
    expect(mergeDatasets(p, {}, now).matches.map((x) => x.id)).toEqual(['c', 'b']);
  });
});
```

- [ ] **Step 2: Run – fail:** `npm test -w data-pipeline -- src/merge.test.ts` → FAIL (chybí `./merge`).

- [ ] **Step 3: Implementace** `data-pipeline/src/merge.ts`
```ts
import { SPORTS, type Match, type Sport, type Team } from '@sportradar/shared';
import type { AdapterResult } from './types';

export interface Dataset { matches: Match[]; teams: Team[] }
export type SportOutcome = AdapterResult | Error;

const KEEP_AFTER_START_MS = 6 * 3600_000;

export function mergeDatasets(prev: Dataset, outcomes: Partial<Record<Sport, SportOutcome>>, now: Date): Dataset {
  const matches = new Map<string, Match>();
  const teams = new Map<string, Team>();
  for (const sport of SPORTS) {
    const out = outcomes[sport];
    const fresh = out && !(out instanceof Error) && out.matches.length > 0 ? out : null;
    const ms = fresh ? fresh.matches : prev.matches.filter((x) => x.sport === sport);
    const ts = fresh ? fresh.teams : prev.teams.filter((x) => x.sport === sport);
    for (const x of ms) matches.set(x.id, x);
    for (const x of ts) teams.set(x.id, x);
  }
  const cutoff = now.getTime() - KEEP_AFTER_START_MS;
  return {
    matches: [...matches.values()]
      .filter((x) => Date.parse(x.startsAt) >= cutoff)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id)),
    teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs')),
  };
}
```
Poznámka k testu 1: očekávané pořadí `['f1:old','nhl:new']` plyne z času (14. 10. < 15. 10.).

- [ ] **Step 4: Run – pass:** `npm test -w data-pipeline -- src/merge.test.ts` → PASS.

- [ ] **Step 5: Commit:** `git add -A && git commit -m "feat(pipeline): merge with last-good-data fallback"`

---

### Task 4: Adaptér F1 (Jolpica/Ergast)

**Files:**
- Create: `data-pipeline/src/adapters/f1.ts`
- Test: `data-pipeline/src/adapters/f1.test.ts`

**Interfaces:**
- Consumes: `getJson`, `AdapterResult`, `Adapter`.
- Produces: `parseF1(json: unknown): AdapterResult`, `f1Adapter: Adapter` (`sport: 'f1'`). Match id `f1:{season}-{round}-{SessionKey}`; `teams: []`; `Team[]` prázdné.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import { parseF1 } from './f1';

const json = {
  MRData: { RaceTable: { Races: [
    {
      season: '2026', round: '23', raceName: 'Abu Dhabi Grand Prix', date: '2026-12-06', time: '13:00:00Z',
      FirstPractice: { date: '2026-12-04', time: '09:30:00Z' },
      Qualifying: { date: '2026-12-05', time: '14:00:00Z' },
    },
    { season: '2026', round: '24', raceName: 'Bez času GP', date: '2026-12-13' },
  ] } },
};

describe('parseF1', () => {
  it('vytvoří zápas pro každou relaci a závod, seřazeně', () => {
    const r = parseF1(json);
    expect(r.matches.map((m) => m.title)).toEqual([
      'Abu Dhabi Grand Prix – 1. trénink',
      'Abu Dhabi Grand Prix – Kvalifikace',
      'Abu Dhabi Grand Prix – Závod',
    ]);
    const race = r.matches[2];
    expect(race.id).toBe('f1:2026-23-Race');
    expect(race.startsAt).toBe('2026-12-06T13:00:00.000Z');
    expect(race.sport).toBe('f1');
    expect(race.competition).toBe('Formule 1');
    expect(race.teams).toEqual([]);
    expect(r.teams).toEqual([]);
  });
  it('přeskočí závod bez času a nepadne na prázdném vstupu', () => {
    expect(parseF1(json).matches.some((m) => m.title.startsWith('Bez času'))).toBe(false);
    expect(parseF1({}).matches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run – fail:** `npm test -w data-pipeline -- src/adapters/f1.test.ts` → FAIL.

- [ ] **Step 3: Implementace** `data-pipeline/src/adapters/f1.ts`
```ts
import type { Match } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { getJson } from '../util';

interface Slot { date?: string; time?: string }
type Race = { season: string; round: string; raceName: string; date?: string; time?: string } & Record<string, unknown>;

const SESSIONS: [key: string, label: string][] = [
  ['FirstPractice', '1. trénink'], ['SecondPractice', '2. trénink'], ['ThirdPractice', '3. trénink'],
  ['SprintQualifying', 'Sprint kvalifikace'], ['Sprint', 'Sprint'], ['Qualifying', 'Kvalifikace'],
];

function toIso(s?: Slot): string | null {
  if (!s?.date || !s.time) return null;
  const t = Date.parse(`${s.date}T${s.time.endsWith('Z') ? s.time : `${s.time}Z`}`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function parseF1(json: unknown): AdapterResult {
  const races = ((json as any)?.MRData?.RaceTable?.Races ?? []) as Race[];
  const matches: Match[] = [];
  for (const race of races) {
    const slots: [string, string, Slot | undefined][] = [
      ...SESSIONS.map(([k, label]) => [k, label, race[k] as Slot | undefined] as [string, string, Slot | undefined]),
      ['Race', 'Závod', { date: race.date, time: race.time }],
    ];
    for (const [key, label, slot] of slots) {
      const startsAt = toIso(slot);
      if (!startsAt) continue;
      matches.push({
        id: `f1:${race.season}-${race.round}-${key}`, sport: 'f1', competition: 'Formule 1',
        startsAt, title: `${race.raceName} – ${label}`, teams: [], broadcasters: [],
      });
    }
  }
  matches.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { matches, teams: [] };
}

export const f1Adapter: Adapter = {
  sport: 'f1',
  async fetch() {
    return parseF1(await getJson('https://api.jolpi.ca/ergast/f1/current.json'));
  },
};
```

- [ ] **Step 4: Run – pass** (stejný příkaz) → PASS.

- [ ] **Step 5: Smoke proti živému API**

Run: `cd data-pipeline && npx tsx -e "import('./src/adapters/f1').then(m=>m.f1Adapter.fetch(new Date())).then(r=>console.log(r.matches.length, r.matches[0]))"`
Expected: počet > 50, první zápas má `startsAt` ve tvaru ISO `…Z`. (Pokud ne, oprav parser podle skutečné odpovědi.)

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(pipeline): F1 adapter"`

---

### Task 5: Adaptér NHL

**Files:**
- Create: `data-pipeline/src/adapters/nhl.ts`
- Test: `data-pipeline/src/adapters/nhl.test.ts`

**Interfaces:**
- Consumes: `getJson`, `combine`, `AdapterResult`, `Adapter`.
- Produces: `parseNhl(json: unknown): AdapterResult`, `nhlAdapter: Adapter` (`sport: 'nhl'`). Team id `nhl:{abbrev}`, match id `nhl:{gameId}`. Bere jen stavy `FUT`, `PRE`, `LIVE`, `CRIT`.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import { parseNhl } from './nhl';

const team = (abbrev: string, place: string, name: string) =>
  ({ abbrev, placeName: { default: place }, commonName: { default: name } });
const json = { gameWeek: [{ date: '2026-10-14', games: [
  { id: 2026020100, gameType: 2, startTimeUTC: '2026-10-14T23:00:00Z', gameState: 'FUT', homeTeam: team('WSH', 'Washington', 'Capitals'), awayTeam: team('SEA', 'Seattle', 'Kraken') },
  { id: 2026020001, gameType: 2, startTimeUTC: '2026-10-11T23:00:00Z', gameState: 'OFF', homeTeam: team('PIT', 'Pittsburgh', 'Penguins'), awayTeam: team('NYR', 'New York', 'Rangers') },
  { id: 2026010009, gameType: 1, startTimeUTC: '2026-10-15T23:00:00Z', gameState: 'FUT', homeTeam: team('PIT', 'Pittsburgh', 'Penguins'), awayTeam: team('WSH', 'Washington', 'Capitals') },
] }] };

describe('parseNhl', () => {
  const r = parseNhl(json);
  it('vezme jen budoucí/probíhající zápasy', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['nhl:2026020100', 'nhl:2026010009']);
  });
  it('mapuje týmy, titulek, soutěž', () => {
    expect(r.matches[0]).toMatchObject({
      sport: 'nhl', competition: 'NHL', startsAt: '2026-10-14T23:00:00.000Z',
      title: 'Washington Capitals – Seattle Kraken', teams: ['nhl:WSH', 'nhl:SEA'],
    });
    expect(r.matches[1].competition).toBe('NHL (přípravné)');
    expect(r.teams.map((t) => t.id).sort()).toEqual(['nhl:NYR', 'nhl:PIT', 'nhl:SEA', 'nhl:WSH']);
    expect(r.teams.find((t) => t.id === 'nhl:SEA')!.name).toBe('Seattle Kraken');
  });
  it('prázdný vstup nepadne', () => { expect(parseNhl({}).matches).toEqual([]); });
});
```

- [ ] **Step 2: Run – fail:** `npm test -w data-pipeline -- src/adapters/nhl.test.ts` → FAIL.

- [ ] **Step 3: Implementace** `data-pipeline/src/adapters/nhl.ts`
```ts
import type { Match, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getJson } from '../util';

const ACTIVE = new Set(['FUT', 'PRE', 'LIVE', 'CRIT']);

interface NhlTeam { abbrev: string; placeName: { default: string }; commonName: { default: string } }
interface NhlGame { id: number; gameType: number; startTimeUTC: string; gameState: string; homeTeam: NhlTeam; awayTeam: NhlTeam }
interface NhlWeek { nextStartDate?: string; gameWeek?: { games?: NhlGame[] }[] }

const name = (t: NhlTeam) => `${t.placeName.default} ${t.commonName.default}`;
const competition = (gameType: number) => (gameType === 1 ? 'NHL (přípravné)' : gameType === 3 ? 'NHL Playoffs' : 'NHL');

export function parseNhl(json: unknown): AdapterResult {
  const week = json as NhlWeek;
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  const addTeam = (t: NhlTeam) => teams.set(`nhl:${t.abbrev}`, { id: `nhl:${t.abbrev}`, sport: 'nhl', name: name(t) });
  for (const day of week.gameWeek ?? []) {
    for (const g of day.games ?? []) {
      addTeam(g.homeTeam); addTeam(g.awayTeam);
      if (!ACTIVE.has(g.gameState)) continue;
      matches.push({
        id: `nhl:${g.id}`, sport: 'nhl', competition: competition(g.gameType),
        startsAt: new Date(g.startTimeUTC).toISOString(),
        title: `${name(g.homeTeam)} – ${name(g.awayTeam)}`,
        teams: [`nhl:${g.homeTeam.abbrev}`, `nhl:${g.awayTeam.abbrev}`], broadcasters: [],
      });
    }
  }
  return { matches, teams: [...teams.values()] };
}

export const nhlAdapter: Adapter = {
  sport: 'nhl',
  async fetch() {
    const parts: AdapterResult[] = [];
    let url = 'https://api-web.nhle.com/v1/schedule/now';
    for (let i = 0; i < 4; i++) {
      const json = await getJson<NhlWeek>(url);
      parts.push(parseNhl(json));
      if (!json.nextStartDate) break;
      url = `https://api-web.nhle.com/v1/schedule/${json.nextStartDate}`;
    }
    return combine(parts);
  },
};
```

- [ ] **Step 4: Run – pass** → PASS.

- [ ] **Step 5: Smoke:** `cd data-pipeline && npx tsx -e "import('./src/adapters/nhl').then(m=>m.nhlAdapter.fetch(new Date())).then(r=>console.log(r.matches.length, r.teams.length))"` → zápasy > 0, týmů ≈ 32.

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(pipeline): NHL adapter"`

---

### Task 6: Adaptér NBA (ESPN scoreboard)

`cdn.nba.com` vrací 403, proto veřejný ESPN scoreboard: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD` (jeden den na dotaz; rozsah dat vrací HTTP 400).

**Files:**
- Create: `data-pipeline/src/adapters/nba.ts`
- Test: `data-pipeline/src/adapters/nba.test.ts`

**Interfaces:**
- Produces: `parseNba(json: unknown): AdapterResult`, `nbaAdapter: Adapter` (`sport: 'nba'`). Team id `nba:{abbreviation}`, match id `nba:{eventId}`. Bere `status.type.state` ∈ {`pre`,`in`}.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import { parseNba } from './nba';

const comp = (home: [string, string], away: [string, string]) => ({
  competitors: [
    { homeAway: 'home', team: { abbreviation: home[0], displayName: home[1] } },
    { homeAway: 'away', team: { abbreviation: away[0], displayName: away[1] } },
  ],
});
const json = { events: [
  { id: '1', date: '2026-10-21T23:00Z', status: { type: { state: 'pre' } }, season: { type: 2 }, competitions: [comp(['ORL', 'Orlando Magic'], ['ATL', 'Atlanta Hawks'])] },
  { id: '2', date: '2026-10-21T20:00Z', status: { type: { state: 'post' } }, season: { type: 2 }, competitions: [comp(['BOS', 'Boston Celtics'], ['NYK', 'New York Knicks'])] },
  { id: '3', date: '2026-10-22T01:00Z', status: { type: { state: 'pre' } }, season: { type: 1 }, competitions: [comp(['LAL', 'Los Angeles Lakers'], ['GSW', 'Golden State Warriors'])] },
] };

describe('parseNba', () => {
  const r = parseNba(json);
  it('vezme jen nezačaté/probíhající', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['nba:1', 'nba:3']);
  });
  it('mapuje čas, titulek, týmy a typ soutěže', () => {
    expect(r.matches[0]).toMatchObject({
      startsAt: '2026-10-21T23:00:00.000Z', title: 'Orlando Magic – Atlanta Hawks',
      teams: ['nba:ORL', 'nba:ATL'], competition: 'NBA',
    });
    expect(r.matches[1].competition).toBe('NBA (přípravné)');
    expect(r.teams).toHaveLength(6);
  });
  it('prázdný vstup nepadne', () => { expect(parseNba({}).matches).toEqual([]); });
});
```

- [ ] **Step 2: Run – fail:** `npm test -w data-pipeline -- src/adapters/nba.test.ts` → FAIL.

- [ ] **Step 3: Implementace**
```ts
import type { Match, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getJson } from '../util';

interface EspnTeam { abbreviation: string; displayName: string }
interface EspnEvent {
  id: string; date: string; status?: { type?: { state?: string } }; season?: { type?: number };
  competitions?: { competitors?: { homeAway: string; team: EspnTeam }[] }[];
}

export function parseNba(json: unknown): AdapterResult {
  const events = ((json as any)?.events ?? []) as EspnEvent[];
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  for (const e of events) {
    const comps = e.competitions?.[0]?.competitors ?? [];
    const home = comps.find((c) => c.homeAway === 'home')?.team;
    const away = comps.find((c) => c.homeAway === 'away')?.team;
    if (!home || !away) continue;
    for (const t of [home, away]) teams.set(`nba:${t.abbreviation}`, { id: `nba:${t.abbreviation}`, sport: 'nba', name: t.displayName });
    const state = e.status?.type?.state;
    if (state !== 'pre' && state !== 'in') continue;
    const startsAt = new Date(e.date);
    if (Number.isNaN(startsAt.getTime())) continue;
    matches.push({
      id: `nba:${e.id}`, sport: 'nba',
      competition: e.season?.type === 1 ? 'NBA (přípravné)' : e.season?.type === 3 ? 'NBA Playoffs' : 'NBA',
      startsAt: startsAt.toISOString(), title: `${home.displayName} – ${away.displayName}`,
      teams: [`nba:${home.abbreviation}`, `nba:${away.abbreviation}`], broadcasters: [],
    });
  }
  return { matches, teams: [...teams.values()] };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');

export const nbaAdapter: Adapter = {
  sport: 'nba',
  async fetch(now) {
    const days = Array.from({ length: 14 }, (_, i) => ymd(new Date(now.getTime() + i * 86400_000)));
    const settled = await Promise.allSettled(days.map((d) =>
      getJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}`)));
    const ok = settled.filter((s): s is PromiseFulfilledResult<unknown> => s.status === 'fulfilled');
    if (ok.length === 0) throw new Error('NBA: všechny dny selhaly');
    return combine(ok.map((s) => parseNba(s.value)));
  },
};
```

- [ ] **Step 4: Run – pass** → PASS.

- [ ] **Step 5: Smoke:** `cd data-pipeline && npx tsx -e "import('./src/adapters/nba').then(m=>m.nbaAdapter.fetch(new Date())).then(r=>console.log(r.matches.length, r.teams.length))"` → zápasy > 0.

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(pipeline): NBA adapter via ESPN"`

---

### Task 7: Adaptér NBL (scraping nbl.basketball/zapasy)

Struktura tabulky (ověřeno 2026-10-12): řádky `tbody tr`; 2. sloupec číslo zápasu, 3. sloupec má atribut `data-sort="YYYY-MM-DD-HH-MM"` (pražský čas), 4. sloupec obsahuje `div.d-flex > div` se dvěma `div` (domácí, hosté), 5. sloupec skóre (u neodehraných `-`), poslední sloupce mohou obsahovat odkaz `a[href*="embed.tvcom.cz"]` (stream TV Com).

**Files:**
- Create: `data-pipeline/src/adapters/nbl.ts`
- Test: `data-pipeline/src/adapters/nbl.test.ts`

**Interfaces:**
- Consumes: `pragueToUtcIso`, `slugify`, `getText`.
- Produces: `parseNbl(html: string): AdapterResult`, `nblAdapter: Adapter` (`sport: 'cz-basket'`). Match id `cz-basket:{číslo zápasu}`, team id `cz-basket:{slug}`. Přeskakuje řádky s číselným skóre (odehrané). TV Com odkaz → `broadcasters: [{ name: 'TV Com', url }]`.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import { parseNbl } from './nbl';

const row = (num: string, sort: string, home: string, away: string, score: string, extra = '') => `
<tr><td>6.</td><td>${num}</td><td data-sort="${sort}">10. 10. 2026<br>So 12:00</td>
<td><div class="d-flex"><img src="a.png"><div><div class="">${home}</div><div class="">${away}</div></div></div></td>
<td>${score}</td><td></td><td>Základní část</td><td>${extra}</td><td></td></tr>`;

const html = `<table><tbody>
${row('32', '2026-10-10-12-00', 'SK Slavia Praha ERA NBK', 'BK KVIS Pardubice', '<a href="/zapas/1"><div>105</div>60</a>')}
${row('74', '2026-10-14-17-30', 'BK KVIS Pardubice', 'BK Olomoucko', '-<br>-', '<a href="http://embed.tvcom.cz/49a2b094/">tv</a>')}
${row('75', '2026-10-25-18-00', 'ERA Basketball Nymburk', 'BK Opava', '-<br>-')}
${row('76', 'neplatne', 'A', 'B', '-')}
</tbody></table>`;

describe('parseNbl', () => {
  const r = parseNbl(html);
  it('přeskočí odehrané a nevalidní řádky', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['cz-basket:74', 'cz-basket:75']);
  });
  it('převede pražský čas na UTC, mapuje týmy a TV Com', () => {
    expect(r.matches[0]).toMatchObject({
      sport: 'cz-basket', competition: 'NBL', startsAt: '2026-10-14T15:30:00.000Z',
      title: 'BK KVIS Pardubice – BK Olomoucko',
      teams: ['cz-basket:bk-kvis-pardubice', 'cz-basket:bk-olomoucko'],
      broadcasters: [{ name: 'TV Com', url: 'http://embed.tvcom.cz/49a2b094/' }],
    });
    expect(r.matches[1].startsAt).toBe('2026-10-25T17:00:00.000Z'); // po změně na zimní čas
    expect(r.matches[1].broadcasters).toEqual([]);
  });
  it('týmy zahrnou i odehrané řádky', () => {
    expect(r.teams.map((t) => t.name)).toContain('SK Slavia Praha ERA NBK');
  });
  it('změněné HTML nepadne', () => { expect(parseNbl('<html></html>').matches).toEqual([]); });
});
```

- [ ] **Step 2: Run – fail:** `npm test -w data-pipeline -- src/adapters/nbl.test.ts` → FAIL.

- [ ] **Step 3: Implementace**
```ts
import * as cheerio from 'cheerio';
import type { Match, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { getText, pragueToUtcIso, slugify } from '../util';

export function parseNbl(html: string): AdapterResult {
  const $ = cheerio.load(html);
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  $('tbody tr').each((_, tr) => {
    const tds = $(tr).children('td');
    if (tds.length < 6) return;
    const num = $(tds[1]).text().trim();
    const sort = $(tds[2]).attr('data-sort') ?? '';
    const names = $(tds[3]).find('div.d-flex > div').last().children('div').map((__, d) => $(d).text().trim()).get();
    if (!num || names.length < 2 || !names[0] || !names[1]) return;
    const [home, away] = names;
    const ids = [home, away].map((n) => {
      const id = `cz-basket:${slugify(n)}`;
      teams.set(id, { id, sport: 'cz-basket', name: n });
      return id;
    });
    if (/\d/.test($(tds[4]).text())) return; // odehráno
    const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/.exec(sort);
    if (!m) return;
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    const tv = $(tr).find('a[href*="embed.tvcom.cz"]').first().attr('href');
    matches.push({
      id: `cz-basket:${num}`, sport: 'cz-basket', competition: 'NBL',
      startsAt: pragueToUtcIso(y, mo, d, h, mi), title: `${home} – ${away}`, teams: ids,
      broadcasters: tv ? [{ name: 'TV Com', url: tv }] : [],
    });
  });
  return { matches, teams: [...teams.values()] };
}

export const nblAdapter: Adapter = {
  sport: 'cz-basket',
  async fetch() {
    return parseNbl(await getText('https://www.nbl.basketball/zapasy'));
  },
};
```

- [ ] **Step 4: Run – pass** → PASS.

- [ ] **Step 5: Smoke:** `cd data-pipeline && npx tsx -e "import('./src/adapters/nbl').then(m=>m.nblAdapter.fetch(new Date())).then(r=>console.log(r.matches.length, r.matches[0], r.teams.length))"` → zápasy > 0, týmů ≈ 10–12. Pokud 0, porovnej skutečné HTML (`curl -A Mozilla https://www.nbl.basketball/zapasy`) s testem a uprav selektory i test.

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(pipeline): NBL scraper"`

---

### Task 8: Adaptér extraligy (scraping hokej.cz po kolech)

Ověřeno 2026-10-12: `https://www.hokej.cz/tipsport-extraliga/zapasy?matchList-view-round-round=N` vrací zápasy kola N. Řádek `tr.js-preview__link[data-href="/zapas/ID"]`, uvnitř dva `.preview__name__wrapper` (domácí, hosté) s `.preview__name--long` a `.preview__name--short`. Neodehraný zápas má `td.preview__desktop .col-1_3` ×3: den (`ČT`), datum (`15. 10.`), čas (`17:30`); odehraný zobrazuje skóre. Rok v HTML chybí. Odložené zápasy nemají čas → přeskočit. Odkazy na kola: `matchList-view-round-round=(\d+)`.

**Files:**
- Create: `data-pipeline/src/adapters/elh.ts`
- Test: `data-pipeline/src/adapters/elh.test.ts`

**Interfaces:**
- Consumes: `pragueToUtcIso`, `getText`, `combine`.
- Produces: `parseElhRound(html: string, now: Date): AdapterResult`, `elhRoundNumbers(html: string): number[]`, `elhAdapter: Adapter` (`sport: 'cz-hockey'`). Team id `cz-hockey:{zkratka}` (např. `cz-hockey:PCE`), match id `cz-hockey:{ID}`, competition `Tipsport extraliga`.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import { elhRoundNumbers, parseElhRound } from './elh';

const side = (long: string, short: string) =>
  `<div class="preview__name__wrapper"><a href="#"><span class="preview__name--long">${long}</span><span class="preview__name--short">${short}</span></a></div>`;
const upcoming = (id: string, home: [string, string], away: [string, string], dow: string, date: string, time: string) => `
<tr data-href="/zapas/${id}" class="js-preview__link"><td class="preview__name text-right">${side(...home)}</td>
<td class="preview__center preview__desktop" colspan="3"><div class="box-snow row"><div class="col-1_3">${dow}</div><div class="col-1_3">${date}</div><div class="col-1_3">${time}</div></div></td>
<td class="preview__name">${side(...away)}</td></tr>`;
const played = (id: string, home: [string, string], away: [string, string]) => `
<tr data-href="/zapas/${id}" class="js-preview__link"><td class="preview__name text-right">${side(...home)}</td>
<td class="preview__score"><span class="blue">4</span></td><td class="preview__period"><span class="match-start-time">ÚT 22. 09.</span></td>
<td class="preview__score"><span class="blue">5</span></td><td class="preview__name">${side(...away)}</td></tr>`;

const PCE: [string, string] = ['HC Dynamo Pardubice', 'PCE'];
const LIB: [string, string] = ['Bílí Tygři Liberec', 'LIB'];
const LIT: [string, string] = ['HC VERVA Litvínov', 'LIT'];
const MHK: [string, string] = ['Mountfield HK', 'MHK'];

const html = `<a href="/tipsport-extraliga/zapasy?matchList-view-round-round=1">1</a>
<a href="/tipsport-extraliga/zapasy?matchList-view-round-round=2">2</a>
<table>${played('2928328', PCE, LIB)}
${upcoming('2928329', LIT, MHK, 'ČT', '15. 10.', '17:30')}
${upcoming('2928330', PCE, LIT, 'SO', '03. 01.', '17:00')}
${upcoming('2928331', MHK, LIB, 'NE', '-', '')}</table>`;

describe('parseElhRound', () => {
  const r = parseElhRound(html, new Date('2026-12-30T12:00:00Z'));
  it('vezme jen neodehrané zápasy s časem', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['cz-hockey:2928329', 'cz-hockey:2928330']);
  });
  it('převede čas z Prahy do UTC a dopočítá rok (přes přelom roku)', () => {
    expect(r.matches[0].startsAt).toBe('2026-10-15T15:30:00.000Z');
    expect(r.matches[1].startsAt).toBe('2027-01-03T16:00:00.000Z'); // 3. 1. je > 90 dní v minulosti → příští rok
  });
  it('mapuje týmy a titulek', () => {
    expect(r.matches[1]).toMatchObject({
      sport: 'cz-hockey', competition: 'Tipsport extraliga',
      title: 'HC Dynamo Pardubice – HC VERVA Litvínov', teams: ['cz-hockey:PCE', 'cz-hockey:LIT'],
    });
    expect(r.teams.map((t) => t.id).sort()).toEqual(['cz-hockey:LIB', 'cz-hockey:LIT', 'cz-hockey:MHK', 'cz-hockey:PCE']);
  });
  it('rok: říjen a now v říjnu zůstane tento rok', () => {
    const r2 = parseElhRound(html, new Date('2026-10-12T12:00:00Z'));
    expect(r2.matches[0].startsAt).toBe('2026-10-15T15:30:00.000Z');
    expect(r2.matches[1].startsAt).toBe('2027-01-03T16:00:00.000Z');
  });
  it('změněné HTML nepadne', () => { expect(parseElhRound('<html></html>', new Date()).matches).toEqual([]); });
});

describe('elhRoundNumbers', () => {
  it('vrátí unikátní čísla kol', () => { expect(elhRoundNumbers(html)).toEqual([1, 2]); });
});
```
- [ ] **Step 2: Run – fail:** `npm test -w data-pipeline -- src/adapters/elh.test.ts` → FAIL.

- [ ] **Step 3: Implementace**
```ts
import * as cheerio from 'cheerio';
import type { Match, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getText, pragueToUtcIso } from '../util';

const BASE = 'https://www.hokej.cz/tipsport-extraliga/zapasy';

function inferYear(month: number, day: number, now: Date): number {
  const y = now.getUTCFullYear();
  return Date.UTC(y, month - 1, day) < now.getTime() - 90 * 86400_000 ? y + 1 : y;
}

export function elhRoundNumbers(html: string): number[] {
  const nums = [...html.matchAll(/matchList-view-round-round=(\d+)/g)].map((m) => Number(m[1]));
  return [...new Set(nums)].sort((a, b) => a - b);
}

export function parseElhRound(html: string, now: Date): AdapterResult {
  const $ = cheerio.load(html);
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  $('tr.js-preview__link').each((_, tr) => {
    const id = /\/zapas\/(\d+)/.exec($(tr).attr('data-href') ?? '')?.[1];
    const sides = $(tr).find('.preview__name__wrapper').map((__, w) => ({
      long: $(w).find('.preview__name--long').first().text().trim(),
      short: $(w).find('.preview__name--short').first().text().trim(),
    })).get();
    if (!id || sides.length < 2 || sides.some((s) => !s.long || !s.short)) return;
    const [home, away] = sides;
    for (const s of sides) teams.set(`cz-hockey:${s.short}`, { id: `cz-hockey:${s.short}`, sport: 'cz-hockey', name: s.long });
    const cells = $(tr).find('td.preview__desktop .col-1_3').map((__, c) => $(c).text().trim()).get();
    if (cells.length < 3) return; // odehráno
    const d = /^(\d{1,2})\.\s*(\d{1,2})\.$/.exec(cells[1]);
    const t = /^(\d{1,2}):(\d{2})$/.exec(cells[2]);
    if (!d || !t) return; // odložený zápas bez data/času
    const [day, month] = [Number(d[1]), Number(d[2])];
    matches.push({
      id: `cz-hockey:${id}`, sport: 'cz-hockey', competition: 'Tipsport extraliga',
      startsAt: pragueToUtcIso(inferYear(month, day, now), month, day, Number(t[1]), Number(t[2])),
      title: `${home.long} – ${away.long}`, teams: [`cz-hockey:${home.short}`, `cz-hockey:${away.short}`], broadcasters: [],
    });
  });
  return { matches, teams: [...teams.values()] };
}

export const elhAdapter: Adapter = {
  sport: 'cz-hockey',
  async fetch(now) {
    const first = await getText(BASE);
    const rounds = elhRoundNumbers(first);
    if (rounds.length === 0) throw new Error('ELH: nenalezena žádná kola (změněné HTML?)');
    const parts: AdapterResult[] = [];
    for (let i = 0; i < rounds.length; i += 4) {
      const batch = await Promise.allSettled(rounds.slice(i, i + 4).map((r) => getText(`${BASE}?matchList-view-round-round=${r}`)));
      for (const b of batch) if (b.status === 'fulfilled') parts.push(parseElhRound(b.value, now));
    }
    if (parts.length === 0) throw new Error('ELH: žádné kolo se nepodařilo stáhnout');
    return combine(parts);
  },
};
```

- [ ] **Step 4: Run – pass** → PASS.

- [ ] **Step 5: Smoke:** `cd data-pipeline && npx tsx -e "import('./src/adapters/elh').then(m=>m.elhAdapter.fetch(new Date())).then(r=>console.log(r.matches.length, r.matches[0], r.teams.length))"` → zápasy > 0, týmů 14–15 (obsahuje `cz-hockey:PCE`). Při 0: porovnej s `curl -A Mozilla "https://www.hokej.cz/tipsport-extraliga/zapasy?matchList-view-round-round=11"` a uprav selektory i test.

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(pipeline): Extraliga scraper"`

---

### Task 9: Vysílatelé, orchestrace a výstup JSON

**Files:**
- Create: `data-pipeline/broadcasters.yml`, `data-pipeline/src/broadcasters.ts`, `data-pipeline/src/run.ts`
- Test: `data-pipeline/src/broadcasters.test.ts`

**Interfaces:**
- Consumes: všechny adaptéry, `mergeDatasets`, `getJson`.
- Produces: `parseBroadcasters(yamlText: string): BroadcasterConfig`, `applyBroadcasters(matches: Match[], cfg: BroadcasterConfig): Match[]`; `run.ts` zapíše `web/public/data/matches.json` (`MatchesFile`) a `teams.json` (`TeamsFile`), exit code 2 když některý adaptér selhal.

- [ ] **Step 1: Failing test** `data-pipeline/src/broadcasters.test.ts`
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Match } from '@sportradar/shared';
import { applyBroadcasters, parseBroadcasters } from './broadcasters';

const m = (id: string, sport: Match['sport'], broadcasters: Match['broadcasters'] = []): Match =>
  ({ id, sport, competition: 'c', startsAt: '2026-10-14T23:00:00.000Z', title: 't', teams: [], broadcasters });

const cfg = parseBroadcasters(`
bySport:
  nhl:
    - { name: Kanál A, url: "https://a.example", checked: "2026-10-12", source: "https://s.example" }
byMatch:
  "nhl:2": [ { name: Kanál B } ]
`);

describe('applyBroadcasters', () => {
  it('přidá vysílatele podle sportu i zápasu a deduplikuje podle názvu', () => {
    const r = applyBroadcasters([m('nhl:1', 'nhl'), m('nhl:2', 'nhl', [{ name: 'Kanál A' }]), m('f1:1', 'f1')], cfg);
    expect(r[0].broadcasters.map((b) => b.name)).toEqual(['Kanál A']);
    expect(r[1].broadcasters.map((b) => b.name)).toEqual(['Kanál A', 'Kanál B']);
    expect(r[2].broadcasters).toEqual([]);
  });
  it('prázdný/chybějící config nepadne', () => {
    expect(parseBroadcasters('')).toEqual({ bySport: {}, byMatch: {} });
  });
});

describe('broadcasters.yml v repu', () => {
  const real = parseBroadcasters(readFileSync(new URL('../broadcasters.yml', import.meta.url), 'utf8'));
  it('každý záznam má name, checked (YYYY-MM-DD) a source (URL)', () => {
    const all = [...Object.values(real.bySport), ...Object.values(real.byMatch)].flat();
    for (const b of all) {
      expect(b.name).toBeTruthy();
      expect((b as any).checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((b as any).source).toMatch(/^https?:\/\//);
    }
  });
});
```

- [ ] **Step 2: Run – fail:** `npm test -w data-pipeline -- src/broadcasters.test.ts` → FAIL.

- [ ] **Step 3: Implementace**

`data-pipeline/broadcasters.yml` (počáteční obsah):
```yaml
# Kde sledovat. Zapisuj jen ověřené údaje: každý záznam musí mít name, checked (YYYY-MM-DD) a source (URL zdroje).
bySport:
  f1: []
  nba: []
  nhl: []
  cz-hockey: []
  cz-basket: []
# Výjimky pro konkrétní zápas: "id zápasu": [ { name, url, checked, source } ]
byMatch: {}
```
`data-pipeline/src/broadcasters.ts`:
```ts
import { parse } from 'yaml';
import type { Broadcaster, Match } from '@sportradar/shared';

export interface BroadcasterConfig {
  bySport: Record<string, (Broadcaster & Record<string, unknown>)[]>;
  byMatch: Record<string, (Broadcaster & Record<string, unknown>)[]>;
}

export function parseBroadcasters(text: string): BroadcasterConfig {
  const raw = (parse(text) ?? {}) as Partial<BroadcasterConfig>;
  return { bySport: raw.bySport ?? {}, byMatch: raw.byMatch ?? {} };
}

export function applyBroadcasters(matches: Match[], cfg: BroadcasterConfig): Match[] {
  return matches.map((m) => {
    const all = [...m.broadcasters, ...(cfg.bySport[m.sport] ?? []), ...(cfg.byMatch[m.id] ?? [])];
    const seen = new Set<string>();
    const broadcasters = all
      .filter((b) => (seen.has(b.name) ? false : (seen.add(b.name), true)))
      .map((b) => (b.url ? { name: b.name, url: b.url } : { name: b.name }));
    return { ...m, broadcasters };
  });
}
```
`data-pipeline/src/run.ts`:
```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { MatchesFile, Sport, TeamsFile } from '@sportradar/shared';
import { applyBroadcasters, parseBroadcasters } from './broadcasters';
import { mergeDatasets, type Dataset, type SportOutcome } from './merge';
import type { Adapter } from './types';
import { f1Adapter } from './adapters/f1';
import { nhlAdapter } from './adapters/nhl';
import { nbaAdapter } from './adapters/nba';
import { elhAdapter } from './adapters/elh';
import { nblAdapter } from './adapters/nbl';
import { getJson } from './util';

const OUT = new URL('../../web/public/data/', import.meta.url);
const adapters: Adapter[] = [f1Adapter, nhlAdapter, nbaAdapter, elhAdapter, nblAdapter];

async function readPrev<T>(name: string): Promise<T | null> {
  try { return JSON.parse(await readFile(new URL(name, OUT), 'utf8')) as T; } catch { /* zkusíme URL */ }
  const base = process.env.PREV_DATA_URL; // musí končit "/"
  if (base) { try { return await getJson<T>(new URL(name, base).href); } catch { /* nic */ } }
  return null;
}

async function main() {
  const now = new Date();
  const prev: Dataset = {
    matches: (await readPrev<MatchesFile>('matches.json'))?.matches ?? [],
    teams: (await readPrev<TeamsFile>('teams.json'))?.teams ?? [],
  };

  const outcomes: Partial<Record<Sport, SportOutcome>> = {};
  const failed: string[] = [];
  await Promise.all(adapters.map(async (a) => {
    try {
      const r = await a.fetch(now);
      outcomes[a.sport] = r;
      console.log(`[ok]   ${a.sport}: ${r.matches.length} zápasů, ${r.teams.length} týmů`);
      if (r.matches.length === 0) { failed.push(a.sport); console.log(`::warning::${a.sport}: 0 zápasů, ponechávám stará data`); }
    } catch (e) {
      outcomes[a.sport] = e instanceof Error ? e : new Error(String(e));
      failed.push(a.sport);
      console.log(`::warning::${a.sport} selhal: ${(e as Error).message}`);
    }
  }));

  const merged = mergeDatasets(prev, outcomes, now);
  const cfg = parseBroadcasters(await readFile(new URL('../broadcasters.yml', import.meta.url), 'utf8'));
  const matches = applyBroadcasters(merged.matches, cfg);

  await mkdir(OUT, { recursive: true });
  const matchesFile: MatchesFile = { generatedAt: now.toISOString(), matches };
  const teamsFile: TeamsFile = { teams: merged.teams };
  await writeFile(new URL('matches.json', OUT), JSON.stringify(matchesFile));
  await writeFile(new URL('teams.json', OUT), JSON.stringify(teamsFile));
  console.log(`Zapsáno: ${matches.length} zápasů, ${merged.teams.length} týmů`);
  process.exitCode = failed.length ? 2 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 4: Run – pass:** `npm test -w data-pipeline` → všechny testy PASS.

- [ ] **Step 5: Vyplň „kde sledovat“ ověřenými údaji**

Pro každý sport vyhledej (WebSearch) aktuální držitele vysílacích práv **pro Českou republiku** v sezóně 2026/27: F1, NBA, NHL, Tipsport extraliga, NBL. Přidej do `bySport` jen to, co potvrzuje dohledatelný zdroj; ke každému záznamu připiš `name`, `url` (domovská stránka/kanál), `checked: "2026-10-12"` a `source` (URL článku/stránky, která to potvrzuje). Co nelze potvrdit, nech prázdné (`[]`). Příklad záznamu:
```yaml
  nhl:
    - { name: "Název kanálu", url: "https://…", checked: "2026-10-12", source: "https://…" }
```
Run: `npm test -w data-pipeline -- src/broadcasters.test.ts` → PASS (test hlídá `checked` a `source`).

- [ ] **Step 6: Spusť celý pipeline naostro**

Run: `npm run data`
Expected: pět řádků `[ok]` (případně `::warning::` u křehkých zdrojů), `Zapsáno: N zápasů, M týmů`; existují `web/public/data/matches.json` a `teams.json`. Ověř: `node -e "const j=require('./web/public/data/matches.json');console.log(j.matches.length,j.matches[0])"`.

- [ ] **Step 7: Commit:** `git add -A && git commit -m "feat(pipeline): broadcasters, orchestration, JSON output"`

---

### Task 10: Webová logika – čas a výběr zápasů

**Files:**
- Create: `web/vite.config.ts`, `web/tsconfig.json`, `web/src/lib/time.ts`, `web/src/lib/schedule.ts`
- Test: `web/src/lib/time.test.ts`, `web/src/lib/schedule.test.ts`

**Interfaces:**
- Produces (`time.ts`): `dayKey(iso: string, tz?: string): string` (YYYY-MM-DD), `formatTime(iso: string, tz?: string): string` (HH:MM), `dayLabel(key: string, now: Date, tz?: string): string`, `formatCountdown(iso: string, now: Date): string`, `isStale(generatedAt: string, now: Date): boolean`.
- Produces (`schedule.ts`): `isFavorite(m: Match, favs: ReadonlySet<string>): boolean`, `selectMatches(matches: Match[], favs: ReadonlySet<string>, now: Date, sport?: Sport | 'all'): Match[]`, `groupByDay(matches: Match[], tz?: string): { key: string; matches: Match[] }[]`.

- [ ] **Step 1: Konfigurace** 

`web/vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
});
```
`web/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "vite.config.ts"] }
```

- [ ] **Step 2: Failing testy**

`web/src/lib/time.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, formatCountdown, formatTime, isStale } from './time';

describe('dayKey / formatTime podle pásma', () => {
  const iso = '2026-10-15T02:30:00.000Z';
  it('Praha (CEST): 15. 10. 04:30', () => {
    expect(dayKey(iso, 'Europe/Prague')).toBe('2026-10-15');
    expect(formatTime(iso, 'Europe/Prague')).toBe('04:30');
  });
  it('New York: ještě 14. 10. 22:30', () => {
    expect(dayKey(iso, 'America/New_York')).toBe('2026-10-14');
    expect(formatTime(iso, 'America/New_York')).toBe('22:30');
  });
});

describe('dayLabel', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  it('Dnes / Zítra / datum', () => {
    expect(dayLabel('2026-10-12', now, 'Europe/Prague')).toBe('Dnes');
    expect(dayLabel('2026-10-13', now, 'Europe/Prague')).toBe('Zítra');
    expect(dayLabel('2026-10-16', now, 'Europe/Prague')).toMatch(/16\.\s*10\./);
  });
});

describe('formatCountdown', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  it('formáty', () => {
    expect(formatCountdown('2026-10-12T10:12:00Z', now)).toBe('za 12 min');
    expect(formatCountdown('2026-10-12T13:20:00Z', now)).toBe('za 3 h 20 min');
    expect(formatCountdown('2026-10-14T13:00:00Z', now)).toBe('za 2 d 3 h');
    expect(formatCountdown('2026-10-12T09:00:00Z', now)).toBe('probíhá');
  });
});

describe('isStale', () => {
  it('starší než 6 h', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    expect(isStale('2026-10-12T05:59:00Z', now)).toBe(true);
    expect(isStale('2026-10-12T07:00:00Z', now)).toBe(false);
  });
});
```
`web/src/lib/schedule.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Match } from '@sportradar/shared';
import { groupByDay, isFavorite, selectMatches } from './schedule';

const m = (id: string, sport: Match['sport'], startsAt: string, teams: string[] = []): Match =>
  ({ id, sport, competition: 'c', startsAt, title: id, teams, broadcasters: [] });

const now = new Date('2026-10-12T12:00:00Z');
const all = [
  m('old', 'nhl', '2026-10-12T07:00:00Z', ['nhl:PIT']),          // 5 h zpátky → pryč
  m('live', 'nhl', '2026-10-12T11:00:00Z', ['nhl:PIT']),         // před 1 h → zůstává
  m('f1', 'f1', '2026-10-18T13:00:00Z'),
  m('pce', 'cz-hockey', '2026-10-13T17:00:00Z', ['cz-hockey:PCE', 'cz-hockey:LIT']),
  m('other', 'cz-hockey', '2026-10-13T18:00:00Z', ['cz-hockey:LIB']),
];

describe('isFavorite', () => {
  it('tým i celý sport', () => {
    expect(isFavorite(all[3], new Set(['cz-hockey:PCE']))).toBe(true);
    expect(isFavorite(all[2], new Set(['f1']))).toBe(true);
    expect(isFavorite(all[4], new Set(['cz-hockey:PCE']))).toBe(false);
  });
});

describe('selectMatches', () => {
  it('jen oblíbené, bez zápasů starších než 3 h, seřazené', () => {
    const r = selectMatches(all, new Set(['nhl:PIT', 'cz-hockey:PCE', 'f1']), now);
    expect(r.map((x) => x.id)).toEqual(['live', 'pce', 'f1']);
  });
  it('filtr podle sportu', () => {
    const r = selectMatches(all, new Set(['nhl:PIT', 'f1']), now, 'f1');
    expect(r.map((x) => x.id)).toEqual(['f1']);
  });
  it('prázdné oblíbené → prázdný výsledek', () => {
    expect(selectMatches(all, new Set(), now)).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('seskupí podle místního dne (půlnoc v jiném pásmu)', () => {
    const a = m('a', 'nhl', '2026-10-14T23:30:00Z'); // Praha 15. 10. 01:30, NY 14. 10. 19:30
    const b = m('b', 'nhl', '2026-10-15T10:00:00Z');
    expect(groupByDay([a, b], 'Europe/Prague').map((g) => [g.key, g.matches.length])).toEqual([['2026-10-15', 2]]);
    expect(groupByDay([a, b], 'America/New_York').map((g) => [g.key, g.matches.length])).toEqual([['2026-10-14', 1], ['2026-10-15', 1]]);
  });
});
```

- [ ] **Step 3: Run – fail:** `npm test -w web` → FAIL (chybí moduly).

- [ ] **Step 4: Implementace**

`web/src/lib/time.ts`:
```ts
const DAY_MS = 86400_000;

export function dayKey(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function formatTime(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export function dayLabel(key: string, now: Date, tz?: string): string {
  const today = dayKey(now.toISOString(), tz);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  if (key === today) return 'Dnes';
  if (key === tomorrow) return 'Zítra';
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' })
    .format(new Date(`${key}T12:00:00Z`));
}

export function formatCountdown(iso: string, now: Date): string {
  const min = Math.floor((Date.parse(iso) - now.getTime()) / 60000);
  if (min <= 0) return 'probíhá';
  if (min < 60) return `za ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `za ${h} h ${min % 60} min`;
  return `za ${Math.floor(h / 24)} d ${h % 24} h`;
}

export function isStale(generatedAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(generatedAt) > 6 * 3600_000;
}
```
`web/src/lib/schedule.ts`:
```ts
import type { Match, Sport } from '@sportradar/shared';
import { dayKey } from './time';

const ONGOING_WINDOW_MS = 3 * 3600_000;

export function isFavorite(m: Match, favs: ReadonlySet<string>): boolean {
  return favs.has(m.sport) || m.teams.some((t) => favs.has(t));
}

export function selectMatches(matches: Match[], favs: ReadonlySet<string>, now: Date, sport: Sport | 'all' = 'all'): Match[] {
  const cutoff = now.getTime() - ONGOING_WINDOW_MS;
  return matches
    .filter((m) => Date.parse(m.startsAt) >= cutoff && (sport === 'all' || m.sport === sport) && isFavorite(m, favs))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}

export function groupByDay(matches: Match[], tz?: string): { key: string; matches: Match[] }[] {
  const groups: { key: string; matches: Match[] }[] = [];
  for (const m of matches) {
    const key = dayKey(m.startsAt, tz);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.matches.push(m); else groups.push({ key, matches: [m] });
  }
  return groups;
}
```

- [ ] **Step 5: Run – pass:** `npm test -w web` → PASS.

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(web): time and schedule logic"`

---

### Task 11: Oblíbené – úložiště a sdílení odkazem

**Files:**
- Create: `web/src/lib/favorites.ts`
- Test: `web/src/lib/favorites.test.ts`

**Interfaces:**
- Produces: `sanitizeFavorites(v: unknown): string[]`, `loadFavorites(storage?: Pick<Storage, 'getItem'>): string[]`, `saveFavorites(storage: Pick<Storage, 'setItem'> | undefined, favs: string[]): void`, `encodeShare(favs: string[]): string` (vrací `#fav=…`), `decodeShare(hash: string): string[] | null` (`null` = hash neobsahuje `fav=`).

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, loadFavorites, sanitizeFavorites, saveFavorites } from './favorites';

describe('sanitizeFavorites', () => {
  it('ponechá jen platná, unikátní id', () => {
    expect(sanitizeFavorites(['f1', 'nhl:PIT', 'f1', '<script>', 5, '', 'a b'])).toEqual(['f1', 'nhl:PIT']);
  });
  it('ne-pole → prázdné; limit 300', () => {
    expect(sanitizeFavorites({ x: 1 })).toEqual([]);
    expect(sanitizeFavorites(Array.from({ length: 1000 }, (_, i) => `t${i}`))).toHaveLength(300);
  });
});

describe('load/save', () => {
  it('poškozený JSON → prázdné', () => {
    expect(loadFavorites({ getItem: () => '{nejson' })).toEqual([]);
    expect(loadFavorites({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
    expect(loadFavorites(undefined)).toEqual([]);
  });
  it('round trip', () => {
    let stored = '';
    saveFavorites({ setItem: (_k, v) => { stored = v; } }, ['f1', 'nhl:PIT']);
    expect(loadFavorites({ getItem: () => stored })).toEqual(['f1', 'nhl:PIT']);
  });
  it('save nepadne, když storage vyhazuje', () => {
    expect(() => saveFavorites({ setItem: () => { throw new Error('quota'); } }, ['f1'])).not.toThrow();
  });
});

describe('share', () => {
  it('encode/decode', () => {
    expect(encodeShare(['f1', 'cz-hockey:PCE'])).toBe('#fav=f1,cz-hockey:PCE');
    expect(decodeShare('#fav=f1,cz-hockey:PCE')).toEqual(['f1', 'cz-hockey:PCE']);
  });
  it('hash bez fav → null; nesmysly se vyčistí', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#jinak=1')).toBeNull();
    expect(decodeShare('#fav=%E0%A4%A')).toEqual([]);
    expect(decodeShare('#fav=<b>,f1,,x y')).toEqual(['f1']);
  });
  it('obrovský hash je omezen', () => {
    const big = '#fav=' + Array.from({ length: 5000 }, (_, i) => `t${i}`).join(',');
    expect(decodeShare(big)!.length).toBe(300);
  });
});
```

- [ ] **Step 2: Run – fail:** `npm test -w web -- src/lib/favorites.test.ts` → FAIL.

- [ ] **Step 3: Implementace** `web/src/lib/favorites.ts`
```ts
const KEY = 'sportradar:favorites:v1';
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,60}$/;
const MAX = 300;

export function sanitizeFavorites(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && ID_RE.test(x) && !out.includes(x)) out.push(x);
    if (out.length >= MAX) break;
  }
  return out;
}

export function loadFavorites(storage?: Pick<Storage, 'getItem'>): string[] {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? sanitizeFavorites(JSON.parse(raw)) : [];
  } catch { return []; }
}

export function saveFavorites(storage: Pick<Storage, 'setItem'> | undefined, favs: string[]): void {
  try { storage?.setItem(KEY, JSON.stringify(favs)); } catch { /* storage nemusí být dostupné */ }
}

export function encodeShare(favs: string[]): string {
  return `#fav=${favs.join(',')}`;
}

export function decodeShare(hash: string): string[] | null {
  const m = /^#?fav=([^&]*)/.exec(hash);
  if (!m) return null;
  let value: string;
  try { value = decodeURIComponent(m[1]); } catch { return []; }
  return sanitizeFavorites(value.split(','));
}
```
Poznámka: ID týmů mají velké zkratky (`nhl:PIT`, `cz-hockey:PCE`), proto `ID_RE` povoluje velká písmena. UI id nijak neupravuje (žádné lowercasování).

- [ ] **Step 4: Run – pass:** `npm test -w web` → PASS.

- [ ] **Step 5: Commit:** `git add -A && git commit -m "feat(web): favorites storage and share links"`

---

### Task 12: UI – Program, Oblíbené, načítání dat

**Files:**
- Create: `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/useData.ts`, `web/src/styles.css`, `web/src/components/MatchCard.tsx`, `web/src/components/ProgramView.tsx`, `web/src/components/FavoritesView.tsx`
- Test: ruční ověření v prohlížeči (logika je pokryta v Task 10–11)

**Interfaces:**
- Consumes: `selectMatches`, `groupByDay`, `dayLabel`, `formatTime`, `formatCountdown`, `isStale`, `loadFavorites`, `saveFavorites`, `encodeShare`, `decodeShare`, `SPORTS`, `SPORT_LABELS`.

- [ ] **Step 1: `web/index.html`**
```html
<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sportradar</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: `useData.ts` a `main.tsx`**

`web/src/useData.ts`:
```ts
import { useEffect, useState } from 'react';
import type { MatchesFile, TeamsFile } from '@sportradar/shared';

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: MatchesFile; teams: TeamsFile };

export function useData(): DataState {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('data/matches.json').then((r) => { if (!r.ok) throw new Error(`matches.json ${r.status}`); return r.json() as Promise<MatchesFile>; }),
      fetch('data/teams.json').then((r) => { if (!r.ok) throw new Error(`teams.json ${r.status}`); return r.json() as Promise<TeamsFile>; }),
    ]).then(([matches, teams]) => { if (!cancelled) setState({ status: 'ready', matches, teams }); })
      .catch((e) => { if (!cancelled) setState({ status: 'error', message: String(e.message ?? e) }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}
```
`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 3: Komponenty**

`web/src/components/MatchCard.tsx`:
```tsx
import type { Match } from '@sportradar/shared';
import { SPORT_LABELS } from '@sportradar/shared';
import { formatCountdown, formatTime } from '../lib/time';

export function MatchCard({ match, now, hero = false }: { match: Match; now: Date; hero?: boolean }) {
  const countdown = formatCountdown(match.startsAt, now);
  return (
    <article className={`card${hero ? ' card--hero' : ''}`}>
      <div className="card__time">
        <strong>{formatTime(match.startsAt)}</strong>
        <span className={countdown === 'probíhá' ? 'live' : 'muted'}>{countdown}</span>
      </div>
      <div className="card__body">
        <div className="card__title">{match.title}</div>
        <div className="muted">{SPORT_LABELS[match.sport]} · {match.competition}</div>
        <div className="badges">
          {match.broadcasters.length === 0 && <span className="badge badge--none">kde sledovat: neznámé</span>}
          {match.broadcasters.map((b) =>
            b.url
              ? <a key={b.name} className="badge" href={b.url} target="_blank" rel="noreferrer">{b.name}</a>
              : <span key={b.name} className="badge">{b.name}</span>)}
        </div>
      </div>
    </article>
  );
}
```
`web/src/components/ProgramView.tsx`:
```tsx
import type { Match, Sport } from '@sportradar/shared';
import { SPORTS, SPORT_LABELS } from '@sportradar/shared';
import { groupByDay } from '../lib/schedule';
import { dayLabel } from '../lib/time';
import { MatchCard } from './MatchCard';

interface Props {
  matches: Match[];            // už vyfiltrované (oblíbené + sport)
  now: Date;
  sport: Sport | 'all';
  onSport: (s: Sport | 'all') => void;
  hasFavorites: boolean;
  onGoFavorites: () => void;
}

export function ProgramView({ matches, now, sport, onSport, hasFavorites, onGoFavorites }: Props) {
  if (!hasFavorites) {
    return (
      <div className="empty">
        <p>Zatím nemáš žádné oblíbené.</p>
        <button className="btn" onClick={onGoFavorites}>Vybrat oblíbené</button>
      </div>
    );
  }
  const [next, ...rest] = matches;
  const groups = groupByDay(rest);
  return (
    <>
      <div className="chips" role="tablist">
        {(['all', ...SPORTS] as const).map((s) => (
          <button key={s} className={`chip${sport === s ? ' chip--on' : ''}`} onClick={() => onSport(s)}>
            {s === 'all' ? 'Vše' : SPORT_LABELS[s]}
          </button>
        ))}
      </div>
      {matches.length === 0 && <p className="muted pad">Žádné nadcházející zápasy pro tento výběr.</p>}
      {next && (
        <section>
          <h2 className="day">Nejbližší zápas</h2>
          <MatchCard match={next} now={now} hero />
        </section>
      )}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="day">{dayLabel(g.key, now)}</h2>
          {g.matches.map((m) => <MatchCard key={m.id} match={m} now={now} />)}
        </section>
      ))}
    </>
  );
}
```
`web/src/components/FavoritesView.tsx`:
```tsx
import { useState } from 'react';
import type { Team } from '@sportradar/shared';
import { SPORTS, SPORT_LABELS } from '@sportradar/shared';

interface Props { teams: Team[]; favs: string[]; onToggle: (id: string) => void; onShare: () => void; shareMsg: string }

export function FavoritesView({ teams, favs, onToggle, onShare, shareMsg }: Props) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase('cs');
  return (
    <>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Hledat tým…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={onShare} disabled={favs.length === 0}>Sdílet</button>
      </div>
      {shareMsg && <p className="muted pad" role="status">{shareMsg}</p>}
      {SPORTS.map((sport) => {
        const list = teams.filter((t) => t.sport === sport && t.name.toLocaleLowerCase('cs').includes(needle));
        return (
          <fieldset key={sport} className="sport">
            <legend>{SPORT_LABELS[sport]}</legend>
            <label className="row row--all">
              <input type="checkbox" checked={favs.includes(sport)} onChange={() => onToggle(sport)} />
              <span>{sport === 'f1' ? 'Celá Formule 1 (tréninky, kvalifikace, závody)' : 'Všechny týmy'}</span>
            </label>
            {list.map((t) => (
              <label key={t.id} className="row">
                <input type="checkbox" checked={favs.includes(t.id)} onChange={() => onToggle(t.id)} />
                <span>{t.name}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: `App.tsx`**
```tsx
import { useEffect, useMemo, useState } from 'react';
import type { Sport } from '@sportradar/shared';
import { FavoritesView } from './components/FavoritesView';
import { ProgramView } from './components/ProgramView';
import { decodeShare, encodeShare, loadFavorites, saveFavorites } from './lib/favorites';
import { selectMatches } from './lib/schedule';
import { isStale } from './lib/time';
import { useData } from './useData';

const storage = (): Storage | undefined => { try { return window.localStorage; } catch { return undefined; } };

function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export default function App() {
  const data = useData();
  const now = useNow(60_000);
  const [favs, setFavs] = useState<string[]>(() => loadFavorites(storage()));
  const [tab, setTab] = useState<'program' | 'favs'>(() => (loadFavorites(storage()).length ? 'program' : 'favs'));
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [shareMsg, setShareMsg] = useState('');
  const [incoming, setIncoming] = useState<string[] | null>(() => {
    const d = decodeShare(window.location.hash);
    return d && d.length ? d : null;
  });

  useEffect(() => saveFavorites(storage(), favs), [favs]);

  const toggle = (id: string) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const clearHash = () => window.history.replaceState(null, '', window.location.pathname + window.location.search);
  const applyIncoming = (merge: boolean) => {
    if (!incoming) return;
    setFavs((f) => (merge ? [...new Set([...f, ...incoming])] : incoming));
    setIncoming(null); clearHash(); setTab('program');
  };
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}${encodeShare(favs)}`;
    try { await navigator.clipboard.writeText(url); setShareMsg('Odkaz zkopírován do schránky.'); }
    catch { setShareMsg(url); }
  };

  const favSet = useMemo(() => new Set(favs), [favs]);
  const selected = useMemo(
    () => (data.status === 'ready' ? selectMatches(data.matches.matches, favSet, now, sport) : []),
    [data, favSet, now, sport],
  );

  return (
    <div className="app">
      <header className="top">
        <h1>Sportradar</h1>
        <nav className="tabs">
          <button className={tab === 'program' ? 'on' : ''} onClick={() => setTab('program')}>Program</button>
          <button className={tab === 'favs' ? 'on' : ''} onClick={() => setTab('favs')}>Oblíbené ({favs.length})</button>
        </nav>
      </header>
      <main>
        {incoming && (
          <div className="banner" role="status">
            Odkaz obsahuje {incoming.length} oblíbených.
            <button className="btn" onClick={() => applyIncoming(false)}>Nahradit</button>
            <button className="btn" onClick={() => applyIncoming(true)}>Sloučit</button>
            <button className="btn btn--ghost" onClick={() => { setIncoming(null); clearHash(); }}>Zrušit</button>
          </div>
        )}
        {data.status === 'loading' && <p className="pad muted">Načítám…</p>}
        {data.status === 'error' && <p className="pad">Data se nepodařilo načíst ({data.message}).</p>}
        {data.status === 'ready' && (
          <>
            {isStale(data.matches.generatedAt, now) && (
              <div className="banner banner--warn">Data nemusí být aktuální (poslední aktualizace {new Date(data.matches.generatedAt).toLocaleString('cs-CZ')}).</div>
            )}
            {tab === 'program'
              ? <ProgramView matches={selected} now={now} sport={sport} onSport={setSport}
                  hasFavorites={favs.length > 0} onGoFavorites={() => setTab('favs')} />
              : <FavoritesView teams={data.teams.teams} favs={favs} onToggle={toggle} onShare={share} shareMsg={shareMsg} />}
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: `styles.css`** (mobile-first, světlé i tmavé téma)
```css
:root {
  --bg: #f6f7f9; --card: #fff; --text: #14181f; --muted: #667085; --line: #e3e6eb;
  --accent: #e4002b; --accent-ink: #fff; --live: #0a8f4d; --warn: #fff4d6;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0f1216; --card: #181c22; --text: #eef0f3; --muted: #9aa3b0; --line: #262c35; --warn: #3a3010; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; }
.app { max-width: 720px; margin: 0 auto; padding: 0 16px 48px; }
.top { position: sticky; top: 0; background: var(--bg); padding: 12px 0 8px; z-index: 2; }
.top h1 { margin: 0 0 8px; font-size: 1.25rem; letter-spacing: .02em; }
.tabs { display: flex; gap: 8px; }
.tabs button { flex: 1; padding: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); border-radius: 10px; font: inherit; }
.tabs button.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.chips { display: flex; gap: 8px; overflow-x: auto; padding: 8px 0; }
.chip { white-space: nowrap; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; }
.chip--on { background: var(--text); color: var(--bg); }
.day { margin: 20px 0 8px; font-size: .85rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.card { display: flex; gap: 14px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
.card--hero { border-color: var(--accent); border-width: 2px; padding: 16px; }
.card__time { display: flex; flex-direction: column; min-width: 64px; }
.card__time strong { font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.card__title { font-weight: 600; }
.muted { color: var(--muted); font-size: .85rem; }
.live { color: var(--live); font-size: .85rem; font-weight: 600; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.badge { font-size: .75rem; padding: 3px 8px; border-radius: 6px; background: var(--line); color: var(--text); text-decoration: none; }
.badge--none { background: transparent; border: 1px dashed var(--line); color: var(--muted); }
.toolbar { display: flex; gap: 8px; padding: 12px 0; }
.search { flex: 1; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; }
.btn { padding: 10px 14px; border: 0; border-radius: 10px; background: var(--accent); color: var(--accent-ink); font: inherit; cursor: pointer; }
.btn:disabled { opacity: .4; cursor: default; }
.btn--ghost { background: transparent; color: var(--text); border: 1px solid var(--line); }
.sport { border: 1px solid var(--line); border-radius: 12px; margin: 0 0 12px; padding: 4px 12px 8px; background: var(--card); }
.sport legend { padding: 0 6px; font-weight: 700; }
.row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); }
.row:first-of-type { border-top: 0; }
.row--all { font-weight: 600; }
.row input { width: 20px; height: 20px; accent-color: var(--accent); }
.banner { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); margin: 8px 0; }
.banner--warn { background: var(--warn); }
.empty { text-align: center; padding: 48px 0; }
.pad { padding: 12px 0; }
```

- [ ] **Step 6: Typecheck, build, ruční ověření**

Run: `npm run build` (v `web`: `tsc -p . && vite build`) → bez chyb. Pak `npm run data` (pokud ještě není `web/public/data`) a `npm run dev`; otevři v Browser pane (`mcp__Claude_Browser__*` nebo `preview_start`), nastav mobilní viewport 375×812 a ověř:
  1. První načtení bez oblíbených → záložka „Oblíbené“; zaškrtnutí „Celá Formule 1“ a týmu (např. Dynamo Pardubice) → „Program“ ukáže nejbližší zápas s odpočtem a seskupení po dnech.
  2. Reload zachová výběr.
  3. „Sdílet“ zkopíruje odkaz; po otevření `…/#fav=f1` v čistém profilu/inkognito se zobrazí banner Nahradit/Sloučit/Zrušit.
  4. Bez horizontálního scrollu při šířce 375 px; v tmavém režimu čitelné.
  5. Konzole bez chyb.
Pokud něco nesedí, oprav a ověř znovu.

- [ ] **Step 7: Commit:** `git add -A && git commit -m "feat(web): program and favorites UI"`

---

### Task 13: CI/CD (GitHub Pages) a README

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1: `.github/workflows/deploy.yml`**
```yaml
name: Update data and deploy
on:
  schedule:
    - cron: '17 * * * *'
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test
      - name: Fetch schedules
        id: pipeline
        continue-on-error: true
        run: npm run data
        env:
          PREV_DATA_URL: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/data/
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: web/dist }
      - name: Fail run if any adapter failed (sends notification e-mail)
        if: steps.pipeline.outcome == 'failure'
        run: exit 1

  deploy:
    needs: build
    if: always() && needs.build.result != 'cancelled'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
Poznámka: job `build` skončí červeně při selhání adaptéru *až po* uploadu artefaktu; `deploy` díky `if: always()` přesto nasadí sloučená data (stará data zůstávají díky `mergeDatasets`). Pokud `upload-pages-artifact` neproběhl (selhal test/build), `deploy` selže, což je žádoucí.

- [ ] **Step 2: `README.md`** – krátce: co to je; `npm install`, `npm run data`, `npm run dev`, `npm test`; kde editovat `data-pipeline/broadcasters.yml` (pravidlo: jen ověřené, `checked`/`source`); jak funguje fallback; poznámka, že scrapery (hokej.cz, nbl.basketball) jsou křehké a běží max 1×/hod s identifikujícím User-Agentem; návod na zapnutí GitHub Pages (Settings → Pages → Source: GitHub Actions) a že pro e-mail při selhání stačí výchozí notifikace GitHub Actions.

- [ ] **Step 3: Lokální ověření celku**

Run: `npm test && npm run data && npm run build`
Expected: všechny testy PASS; `web/dist/index.html` a `web/dist/data/matches.json` existují.

- [ ] **Step 4: Commit:** `git add -A && git commit -m "ci: scheduled data update and GitHub Pages deploy; README"`

- [ ] **Step 5: Publikace (vyžaduje souhlas uživatele)**

Vytvoření vzdáleného GitHub repozitáře a `git push` je vnější akce – **zeptej se uživatele** (název repo, veřejné/soukromé; pozor: GitHub Pages u soukromého repa vyžaduje placený plán). Po souhlasu: `gh repo create sportradar --source . --push`, zapnout Pages (Source: GitHub Actions), spustit workflow ručně (`gh workflow run "Update data and deploy"`) a ověřit živou URL.

---

## Self-Review (provedeno)

- **Pokrytí specu:** rozsah F1/NBA/NHL/ELH/NBL → Task 4–8; jednotný model → Task 1; izolace adaptérů + fallback + 0 zápasů → Task 3, 9; kde sledovat (`broadcasters.yml`) → Task 9; Program (nejbližší zápas, dny, odpočet, badge) + Oblíbené (F1 jako celek) + filtr sportu → Task 12; localStorage + sdílení + import → Task 11–12; stav „data starší 6 h“ a prázdný výběr → Task 10, 12; e-mail při selhání → Task 13; hosting rozhodnut: GitHub Pages.
- **Odchylka od specu:** zdroj NBA je ESPN (cdn.nba.com vrací 403) — viz Task 6; ELH čte kola z hokej.cz, NBL tabulku z nbl.basketball/zapasy (ověřeno 2026-10-12).
- **Konzistence typů:** `AdapterResult`, `Adapter`, `Dataset`, `SportOutcome`, `Broadcaster`, `MatchesFile`, `TeamsFile` použity shodně; ID týmů mají velké zkratky (`nhl:PIT`) a `ID_RE` je povoluje.
- **Placeholdery:** jediná datová položka určená k doplnění při realizaci je obsah `broadcasters.yml` (Task 9 Step 5) — má přesný postup a test, který vynutí `checked` a `source`.
