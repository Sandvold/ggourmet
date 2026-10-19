---
name: meny-viner
description: Legg inn vinene som ble servert til en meny i Neon, fra skjermbilder eller tekst: kobler til CellarTracker, finner ca.-pris og setter dato.
---

# Meny-viner

Kristoffer limer inn skjermbilder eller tekst fra chatten der en middag ble planlagt (retter, hvem som tok med hva, flaskebilder). Legg vinene inn på riktig meny i Neon. Svar kort, på norsk.

## Data
Neon-prosjekt `dawn-lab-85569680` («mat-og-vin»). Rør aldri `ct_credentials`.
- `menus` (menu_no, title, event_date, featured), `courses` (menu_id, position, dish)
- `pairings` (course_id, wine_id ELLER wine_text, vintage, grape, region, country, color, price, price_kind, notes)
- `wines` = vinkatalog fra CellarTracker, `consumed` = flasker drukket ifølge CellarTracker (consumed_on, wine_id)
- `drunk` (visning) = vinene fra menyene med pris og gjestenes snitt

## Fremgangsmåte
1. **Finn menyen.** Sammenlign rettene med `menu_overview` / `courses`. Finnes den ikke, lag ny meny (tittel blir automatisk «Meny N») med rettene i rekkefølge. Rør ikke `featured` uten at han ber om det.
2. **Finn datoen.** Bruk datoene i skjermbildene (planlegging skjer typisk 1–3 dager før). Sjekk `consumed` ±3 uker rundt for kvelder med flere flasker:
   `SELECT consumed_on, w.id, w.name, w.vintage FROM consumed c JOIN wines w ON w.id = c.wine_id WHERE consumed_on BETWEEN ... ORDER BY 1`
   Flasker fra kjelleren blir ofte registrert dagen etter eller noen dager før. Sett `event_date` når datoen er rimelig sikker.
3. **Fordel vinene rett for rett.** Bruk det som faktisk ble bestemt i chatten (ikke forslag som ble forkastet; «frede»/«spare» betyr ikke drukket). Flere viner per rett er greit. Står det bare en beskrivelse («tørr riesling»), legg inn førstevalget som tekst og skriv «anslag» i notes.
4. **Kjellervin:** finnes vinen i `wines`, bruk `wine_id` (pris og drue kommer da fra CellarTracker). Ellers: `wine_text` uten årgang + `vintage`, `grape` (CellarTracker-navn, f.eks. Chardonnay, Red Bordeaux Blend), `region` (engelsk: Burgundy, Piedmont, Loire Valley), `country` (engelsk), `color` (Red/White/Rosé).
5. **Pris:** har noen oppgitt pris, bruk den (`price_kind='kjopspris'` hvis faktisk betalt, ellers `'estimert'`). Ellers søk Vinmonopolet for viner med fullt navn og bruk nærmeste årgang som ca.-pris (`price_kind='estimert'`). Generiske navn («Champagne», «Saint-Aubin») får ingen pris. Ved utenlandske priser: regn grovt om til NOK og si det.
6. **Skriv** i én `run_sql_transaction`: event_date, eventuelle nye retter, alle pairings. Avslutt med en SELECT som viser rett for rett.

## Svar
Nummerert liste rett for rett: rett – vin (hvem, ca.-pris). Deretter maks to korte punkter med reelle uklarheter («Var det Margaux på lammet eller short rib?»). Spør bare når svaret endrer hva som lagres; ellers gjør et rimelig valg og merk det som anslag. Kilder for priser til slutt.

## Rettinger
Når han korrigerer («droppet citranen», «den var en 22»): oppdater eller slett bare den ene raden og bekreft i én linje.
