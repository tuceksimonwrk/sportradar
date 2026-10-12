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

## Připomínky v kalendáři

Každý nadcházející zápas jde přidat do kalendáře tlačítkem u karty (stáhne se `.ics`). Záložka **Oblíbené → Připomínky v kalendáři** nabízí navíc:

- **Upozornit** – nastavitelný předstih: bez připomínky, 15 min, 30 min, 1 h (výchozí) nebo 2 h; volba se pamatuje v prohlížeči.
- **Odebírat** – otevře `webcal://` odkaz na feed oblíbeného týmu / sportu (aktualizuje se sám), nebo **Kopírovat odkaz** a vložit ručně („Přidat kalendář z URL“).
- **Stáhnout všechny nadcházející zápasy (.ics)** – jednorázový soubor se všemi zápasy oblíbených.

Upozornění je v souboru jako `VALARM` (`TRIGGER:-PT<min>M`; u „bez připomínky“ se `VALARM` neemituje). Apple Kalendář a většina aplikací ho vezme ze souboru; **Google Kalendář** připomínky z odebíraných kalendářů nepřebírá – v nastavení odebíraného kalendáře je nutné zapnout výchozí upozornění.

Protože je web statický, pipeline generuje feed pro každý předstih: `web/public/data/cal/<minuty>/<tým>.ics` a `<sport>.ics` (minuty 0, 15, 30, 60, 120; `:` v id týmu se mění na `_`). Stará cesta `cal/<název>.ics` zůstává a odpovídá variantě 60 min, takže dřívější odběry fungují dál. **Změna předstihu znamená odebírat odpovídající feed znovu**, protože připomínka je uložená přímo v souboru.

Feedy se generují při každém hodinovém běhu (jen zápasy bez výsledku, start ≥ teď − 3 h); soubory, které už nevznikly, se po úspěšném zápisu všech nových smažou (i prázdné složky). Absolutní odkaz na web do popisu bere z proměnné `SITE_URL` (nastavuje workflow).

## Detail zápasu

U nejbližšího zápasu a u nadcházejících karet se objeví tlačítko **Detail zápasu** (jen pokud pro zápas existuje detail). Otevře panel s porovnáním týmů a sestavami (u F1 pořadí šampionátu a rošt).

- **Okno:** detaily se generují pro zápasy bez výsledku, které začínají v příštích **36 hodinách** (probíhající do 3 h od začátku si detail nechají), max. 80 zápasů. Data obnovuje **hodinová pipeline** – nejde o živá data.
- **Soubory:** `web/public/data/detail/<id>.json` (id jako u kalendářů: `nhl:2026020098` → `nhl_2026020098.json`, viz `detailFileName` ve `shared`) a `detail/index.json` se seznamem id. Web načte index jednou; když chybí, tlačítka se nezobrazí.
- **Co obsahuje podle sportu:**
  - **NHL** (api-web.nhle.com): sezóna (pořadí, body, bilance, góly na zápas, doma/venku, série), forma hráčů za posledních 5 zápasů, nejlepší hráči sezóny, brankáři (průměr obdržených gólů, úspěšnost zákroků); soupisky obou týmů (útočníci, obránci, brankáři).
  - **NBA** (ESPN): sezóna (pořadí v konferenci, bilance, doma/venku, obdržené body, série), posledních 5 zápasů, vzájemné zápasy v sezóně, lídři týmu (pokud je ESPN uvádí – v přípravě bývají prázdné); soupisky po pozicích se zdravotním stavem (Zraněn / Nejistý / Pochybný).
  - **F1** (Jolpica): pořadí jezdců (top 10) a konstruktérů, program víkendu; u závodu startovní rošt podle kvalifikace (po kvalifikaci, bez penalizací), jinak seznam jezdců podle šampionátu.
  - **Extraliga** (hokej.cz): porovnání z tabulky (pořadí, body, bilance V–VP–PP–P, góly na zápas, skóre) a soupisky klubů ze stránky `/klub/<slug>/<id>/soupiska`. Konkrétní rozestavení na zápas hokej.cz zveřejňuje až krátce před zápasem – detail ho neobsahuje.
  - **NBL** (nbl.basketball): porovnání z tabulky (pořadí, bilance, úspěšnost, body na zápas), nejlepší hráči (průměry B / DC / AS / VAL) a soupisky po postech ze stránek týmů. Sestava na zápas není k dispozici (FIBA LiveStats je před zápasem nepřístupné).
- **Poctivé limity:** sestavy jsou **soupisky**, ne potvrzené sestavy na zápas (UI to uvádí v poznámce); NHL/ELH nemají přesilovky v %. Co se nepodaří stáhnout, nahradí v detailu poznámka.
- **Chyby:** stahování je zdvořilé (max 4 souběžné požadavky, týmová data jednou za běh, identifikující User-Agent; počet požadavků se loguje). Selhání jednoho detailu běh neshodí – použije se předchozí soubor (lokálně nebo z `PREV_DATA_URL`), jinak se zápas vynechá. Exit kód 2 jen když selžou **všechny** detaily sportu, který má zápasy v okně. Zastaralé detaily se mažou až po zápisu nových. Nasazení detaily neblokují.

## Kde vysílá (broadcasters)

Vysílací stanice se editují v `data-pipeline/broadcasters.yml`. Pravidlo: zapisujeme jen ověřené údaje, každý záznam musí mít `checked` (datum ověření) a `source` (odkud je to ověřeno) – vynucuje to test.

## Fallback a chyby adaptérů

Každý adaptér (sport) běží izolovaně. Když jeden selže, použijí se pro něj poslední známá data z nasazeného webu (`PREV_DATA_URL`, funkce `mergeDatasets`), ostatní sporty se aktualizují normálně. Web ukazuje upozornění, když jsou data starší než 6 h.

Scrapery (hokej.cz, nbl.basketball) jsou křehké – změna HTML je rozbije. Běží maximálně 1× za hodinu a hlásí se identifikujícím User-Agentem.

## Nasazení (GitHub Pages)

1. Settings → Pages → Source: **GitHub Actions**.
2. Workflow `.github/workflows/deploy.yml` běží při pushi na `main`, ručně i každou hodinu (cron).
3. Při selhání adaptéru workflow skončí červeně (po nasazení sloučených dat) a stačí výchozí notifikace GitHub Actions – přijde e-mail.
