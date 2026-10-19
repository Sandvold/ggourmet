# Guldberglia gourmet

Menykortet ved bordet: dagens meny med viner, gjestenes vurderinger, vinene fra menyene og arkiv over tidligere menyer.

## Oppbygning

- `public/` – den statiske nettsiden (ingen byggesteg). Netlify publiserer denne mappen, se `netlify.toml`.
  - `index.html` – dagens meny; gjestene vurderer hver rett og hver vin (0,5–5 stjerner, halve trinn)
  - `arkiv.html` – tidligere menyer som kompakte menykort med vinene (`/arkiv`)
  - `viner.html` – vinene som er servert til menyene, fordelt på region, drue, land og farge (`/viner`)
  - `config.js` – adressen til API-et
- `sync/index.mjs` – ukentlig synk fra CellarTracker (Neon Function `ctsync`).
- `tools/preview.py` – skjermbilder av alle sidene med testdata: `python tools/preview.py` (krever `pip install playwright`).
- `.github/workflows/deploy-functions.yml` – deployer `api/` og `sync/` til Neon ved push til main. Krever hemmeligheten `NEON_API_KEY`.
- `api/index.mjs` – API-et, kjører som Neon Function `gourmetapi` i Neon-prosjektet `mat-og-vin`.
  Det kaller bare faste SQL-funksjoner i databasen (`api_today`, `api_archive`, `api_menu_json`, `api_rate`, `api_my_ratings`).

## API

| Metode | Sti | Hva |
| --- | --- | --- |
| GET | `/today` | Dagens meny |
| GET | `/archive` | Alle andre menyer, nyeste først |
| GET | `/drunk` | Vinene fra menyene (`pairings`), én rad per vin per meny |
| GET | `/menu/{id}` | Én meny |
| GET | `/mine?client=…&menu=…` | Gjestens egne stjerner (for å vise dem igjen) |
| POST | `/rate` | `{client_id, menu_id, course_id?, pairing_id?, stars (0.5–5, halve trinn), comment?, guest_name?}` – rett eller vin (pairing) |

Hver gjest har én vurdering per rett og én per vin. En ny vurdering erstatter den forrige.

## Hvilken meny vises som dagens meny?

Menyen med `featured = true`. Hvis ingen er merket, viser forsiden «TBD» og alle menyene ligger i arkivet.

```sql
UPDATE menus SET featured = (menu_no = 7);
```

Vinen under hver rett kommer fra `pairings` (koblet til kjellervinen, eller fritekst med drue/region/land/pris for andre viner), og teksten under overskriften fra `menus.public_intro`.
Interne notater på rettene (`courses.notes`) vises aldri på siden.
