# Sportradar – design

## Cíl
Webová aplikace (responzivní, mobile-first), kde si uživatel zaklikne oblíbené sporty/týmy a vidí, **kdy se hraje jejich příští zápas v jeho časovém pásmu** a **kde ho lze sledovat**.

## Rozsah (v1)
- F1 (kvalifikace, závod, sprint…)
- NBA, NHL
- Česká extraliga ledního hokeje (důraz: Dynamo Pardubice)
- Český basketbal (NBL)
- Mimo rozsah: živé skóre, notifikace, účty, výsledky/tabulky.

## Architektura (varianta A: statický web + plánovaný sběr dat)
- **Sběr dat**: skripty (Node/TypeScript) spouštěné GitHub Actions cron (cca každou hodinu). Výstup `matches.json` a `teams.json` se nasadí společně s webem na statický hosting (Cloudflare Pages nebo GitHub Pages).
- **Web**: Vite + React + TypeScript, čistě statický, načítá JSON a filtruje na klientovi.

## Datový model
```
Match { id, sport, competition, startsAt (ISO UTC), title, teams[], broadcasters[] }
Team  { id, sport, name }
```
Jednotný tvar pro všechny zdroje; web nezná původ dat.

## Sběr dat
- Jeden adaptér na zdroj (`f1`, `nba`, `nhl`, `cz-hockey`, `cz-basket`).
- F1/NBA/NHL: veřejné rozvrhy/API – konkrétní zdroje se ověří na začátku implementace.
- Extraliga a NBL: scraping webů lig (křehké; zdroj bude ověřen a pokryt testy na uložených ukázkách).
- Adaptéry běží izolovaně; selhání jednoho nepřepíše jeho poslední dobrá data. Výsledek s 0 zápasy nepřepíše stará data. Selhání workflow = e-mail z GitHubu.
- **Kde sledovat**: ručně udržovaný `broadcasters.yml` (soutěž → vysílatelé, volitelně výjimky pro konkrétní zápas). Údaje se vyplní z veřejných informací a uživatel je opravuje.

## Web
- Obrazovka **Program**: zápasy oblíbených podle času, seskupené po dnech, zvýrazněný nejbližší zápas s odpočtem, čas v místním pásmu (`Intl.DateTimeFormat`), odznaky vysílatelů.
- Obrazovka **Oblíbené**: výběr sportů/týmů; u F1 celé GP a jednotlivé relace.
- Filtr podle sportu.
- Oblíbené v localStorage + tlačítko Sdílet (výběr v URL hash, na druhém zařízení nabídka importu).
- Stavy: data starší než 6 h → upozornění; prázdný výběr → výzva k výběru.

## Testy
Jednotkové testy logiky (filtrování, seskupení po dnech, převod času, import z URL) a adaptérů na uložených ukázkách odpovědí (bez živých požadavků).

## Struktura repozitáře (návrh)
```
/data-pipeline   adaptéry, normalizace, broadcasters.yml, výstup JSON
/web             Vite + React aplikace
/.github/workflows  cron sběr + deploy
/docs/superpowers/specs
```

## Otevřené body (řeší se v plánu)
- Výběr konkrétních datových zdrojů a ověření licenčních/ToS podmínek scrapingu.
- Volba hostingu (Cloudflare Pages vs GitHub Pages).
