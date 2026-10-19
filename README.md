# Guldberglia gourmet

Menykortet ved bordet: dagens meny med viner, gjestenes vurderinger og arkiv over tidligere menyer.

## Oppbygning

- `public/` – den statiske nettsiden (ingen byggesteg). Netlify publiserer denne mappen, se `netlify.toml`.
  - `index.html` – dagens meny med stjernevurdering per rett og for hele kvelden
  - `arkiv.html` – tidligere menyer (`/arkiv`)
  - `config.js` – adressen til API-et
- `api/index.mjs` – API-et, kjører som Neon Function `gourmetapi` i Neon-prosjektet `mat-og-vin`.
  Det kaller bare faste SQL-funksjoner i databasen (`api_today`, `api_archive`, `api_menu_json`, `api_rate`, `api_my_ratings`).

## API

| Metode | Sti | Hva |
| --- | --- | --- |
| GET | `/today` | Dagens meny |
| GET | `/archive` | Alle andre menyer, nyeste først |
| GET | `/menu/{id}` | Én meny |
| GET | `/mine?client=…&menu=…` | Gjestens egne stjerner (for å vise dem igjen) |
| POST | `/rate` | `{client_id, menu_id, course_id?, pairing_id?, stars, comment?, guest_name?}` – rett, vin (pairing) eller hele menyen |

Hver gjest har én vurdering per rett, én per vin og én for hele menyen. En ny vurdering erstatter den forrige.

## Hvilken meny vises som dagens meny?

Menyen med `featured = true`. Hvis ingen er merket: menyen med høyest nummer.

```sql
UPDATE menus SET featured = (menu_no = 7);
```

Vinen under hver rett kommer fra `pairings`, og teksten under overskriften fra `menus.public_intro`.
Interne notater på rettene (`courses.notes`) vises aldri på siden.
