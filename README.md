# Sportradar

Webová aplikace s přehledem nadcházejících zápasů (F1, NBA, NHL, Extraliga ELH, NBL) a tím, kde je vysílají. Data se hodinově stahují z veřejných zdrojů, sloučí do `matches.json` a nasadí jako statický web na GitHub Pages. Oblíbené týmy se ukládají v prohlížeči (localStorage), lze je sdílet odkazem a importovat.

## Spuštění

```
npm install
npm run data   # stáhne rozpisy do web/public/data (živé zdroje)
npm run dev    # vývojový server
npm test       # testy všech balíčků
npm run build  # produkční build do web/dist
```

## Kde vysílá (broadcasters)

Vysílací stanice se editují v `data-pipeline/broadcasters.yml`. Pravidlo: zapisujeme jen ověřené údaje, každý záznam musí mít `checked` (datum ověření) a `source` (odkud je to ověřeno) – vynucuje to test.

## Fallback a chyby adaptérů

Každý adaptér (sport) běží izolovaně. Když jeden selže, použijí se pro něj poslední známá data z nasazeného webu (`PREV_DATA_URL`, funkce `mergeDatasets`), ostatní sporty se aktualizují normálně. Web ukazuje upozornění, když jsou data starší než 6 h.

Scrapery (hokej.cz, nbl.basketball) jsou křehké – změna HTML je rozbije. Běží maximálně 1× za hodinu a hlásí se identifikujícím User-Agentem.

## Nasazení (GitHub Pages)

1. Settings → Pages → Source: **GitHub Actions**.
2. Workflow `.github/workflows/deploy.yml` běží při pushi na `main`, ručně i každou hodinu (cron).
3. Při selhání adaptéru workflow skončí červeně (po nasazení sloučených dat) a stačí výchozí notifikace GitHub Actions – přijde e-mail.
