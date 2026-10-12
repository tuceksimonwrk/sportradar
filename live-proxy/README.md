# live-proxy – živé skóre NHL, extraligy a NBL

Malý **Cloudflare Worker** (zdarma), který na serveru stáhne živé skóre ze zdrojů,
které prohlížeč kvůli CORS číst nesmí, a vrátí ho webu jako jednoduchý JSON:

| Cesta | Zdroj | Co vrací |
|---|---|---|
| `/nhl?date=YYYY-MM-DD` | `api-web.nhle.com/v1/score/<den>` (den podle času v New Yorku; bez `date` = dnešek, po půlnoci i včerejšek) | skóre, třetina + čas, přestávka, prodloužení, nájezdy |
| `/elh?date=YYYY-MM-DD` | JSON scoreboardu hokej.cz `json.esports.cz/hokejcz/scoreboard/<den>.json` (pražský den) | skóre, třetina (bez běžícího času), přestávka, prodloužení, nájezdy |
| `/nbl` | rozpis `nbl.basketball/zapasy` + FIBA LiveStats `data.json` u právě hraných zápasů | skóre, čtvrtina + čas, poločas, prodloužení |
| `/health` | – | `{ "ok": true }` |

Ochrana: jen `GET` (jinak 405), pevné adresy zdrojů (žádné obecné proxy), datum jen ve tvaru
`YYYY-MM-DD` a nejvýš ±4 dny od dneška, časový limit 8 s a limit velikosti odpovědi, žádná tajemství.
CORS hlavičku dostanou jen povolené weby (`ALLOWED_ORIGINS`). Odpovědi se 10 s drží v cache,
takže víc návštěvníků sdílí jeden dotaz na zdroj; při výpadku zdroje Worker ještě až 60 s vrací
poslední známá data, pak `502 {"error":"upstream unavailable"}`.

## Nasazení (jednou, cca 10 minut)

1. Založ si zdarma účet na <https://dash.cloudflare.com/sign-up> (stačí e-mail, karta není potřeba).
2. V terminálu v kořeni repozitáře nainstaluj závislosti (pokud jsi to ještě neudělal): `npm install`
3. Přejdi do složky Workeru: `cd live-proxy`
4. Přihlas se: `npx wrangler login` – otevře se prohlížeč, potvrď přístup.
5. Nasaď: `npx wrangler deploy`
6. Wrangler vypíše adresu, např. `https://sportradar-live.<tvoje-subdomena>.workers.dev`. Zkopíruj ji.
   (Při prvním nasazení se tě může zeptat na název subdomény `workers.dev` – zvol libovolný.)
7. Vyzkoušej (nahraď adresu svou):
   ```sh
   curl https://sportradar-live.<subdomena>.workers.dev/health
   curl "https://sportradar-live.<subdomena>.workers.dev/nhl"
   curl "https://sportradar-live.<subdomena>.workers.dev/elh"
   curl "https://sportradar-live.<subdomena>.workers.dev/nbl"
   ```
   `/health` má vrátit `{"ok":true,...}`, ostatní `{"source":"…","fetchedAt":"…","games":[…]}`
   (mimo hrací dny může být `games` prázdné).
8. Zapni proxy ve webu: do souboru `web/public/live-config.json` vlož adresu **bez lomítka na konci**:
   ```json
   { "proxyUrl": "https://sportradar-live.<subdomena>.workers.dev" }
   ```
   Commitni a pushni – GitHub Actions web nasadí jako obvykle. Kód se neupravuje; prázdné
   `"proxyUrl": ""` funkci zase vypne (web pak na proxy neposílá žádné dotazy).
9. Na webu se v patičce objeví „+ NHL, extraliga, NBL (přes vlastní proxy)“, jakmile proxy odpoví na `/health`.

## Povolené weby (CORS)

Výchozí hodnota je v `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://tuceksimonwrk.github.io,http://localhost:5173,http://localhost:5199"
```

Jiný web (např. vlastní doména) přidej čárkou, uveď jen schéma + doménu (bez cesty a lomítka)
a znovu spusť `npx wrangler deploy`. Lze to změnit i v Cloudflare dashboardu
(Workers & Pages → sportradar-live → Settings → Variables), ale další `wrangler deploy`
hodnotu přepíše tou z `wrangler.toml`.

## Limity bezplatného plánu

- 100 000 požadavků na Worker denně (počítá se každý dotaz z prohlížeče, i ten obsloužený z cache).
- Web se ptá jen když je záložka vidět a jen u zápasů od 15 min před začátkem do 4 h po něm,
  jednou za 20 s na zdroj: jeden divák s otevřeným webem při zápase NHL ≈ 180 dotazů/h.
  Na osobní použití je rezerva obrovská.
- Cache (10 s, paměť Workeru + Cache API) šetří hlavně zdroje: ať se dívá kolik lidí chce, NHL/hokej.cz/NBL
  dostanou z jednoho datacentra nejvýš ~1 dotaz za 10 s. Pozn.: na doméně `*.workers.dev` může být
  Cache API bez efektu – pak funguje jen paměťová cache v rámci jedné instance Workeru.
- Limit CPU 10 ms na požadavek: běžně stačí; u NBL se parsuje HTML rozpisu a JSON FIBA (stovky kB)
  pro každý právě hraný zápas – při více souběžných zápasech může být hranice blízko.
  Když Cloudflare požadavek utne, web zobrazí „živé skóre nedostupné“ a zkusí to znovu s prodlevou.

## Lokální vývoj (bez přihlášení)

```sh
cd live-proxy
npx wrangler dev --local --port 8787   # http://127.0.0.1:8787/health
npm test                               # parsery na skutečných vzorcích + handler s mockovaným fetch/cache
npm run typecheck
```

Pro vyzkoušení s webem dočasně dej do `web/public/live-config.json` `"proxyUrl": "http://127.0.0.1:8787"`
a spusť `npm run dev -w web -- --port 5199` (ten origin je povolený). Adresu necommituj.

## Spolehlivost zdrojů

- **NHL**: oficiální JSON (stejný, ze kterého čte nhl.com); stav `FUT/PRE` → před zápasem, `LIVE/CRIT` → živě,
  `OFF/FINAL` → konec. Spolehlivé, včetně času třetiny a přestávek.
- **Extraliga**: neveřejný JSON, který si načítá scoreboard na hokej.cz. Stav „live“ i konečný výsledek jsou
  spolehlivé, **běžící čas ale zdroj neposílá**, jen číslo třetiny / přestávku. Den bez zápasů vrací 404 (= prázdný seznam).
  Pokud hokej.cz změní tvar dat, parser vrátí prázdný seznam (žádná chyba na webu, jen bez živého skóre).
- **NBL**: rozpis z nbl.basketball dává čas začátku a odkaz na FIBA LiveStats; živá data jsou až po zahájení
  (před zápasem FIBA vrací 403 → hlásíme „před zápasem“). Zápas bez odkazu na FIBA nebo bez dat déle než 30 min
  po začátku se vynechá (stav neznáme). Párování s webem je podle jmen týmů a dne.

## Odstranění

```sh
cd live-proxy
npx wrangler delete
```

a ve `web/public/live-config.json` vrať `"proxyUrl": ""`. Případně smaž Worker v dashboardu
(Workers & Pages → sportradar-live → Settings → Delete).
