(() => {
  const API = (window.GOURMET_API || "").replace(/\/+$/, "");
  const main = document.getElementById("innhold");
  const side = document.body.dataset.side;

  // ---------- Hjelpere ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const datoFmt = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const kortDato = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric" });
  function dato(iso, fmt = datoFmt) {
    if (!iso) return "";
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    if (!y) return "";
    return fmt.format(new Date(y, m - 1, d));
  }
  const tall = (n) => Number(n).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function klientId() {
    let id = null;
    try { id = localStorage.getItem("gg_klient"); } catch {}
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      try { localStorage.setItem("gg_klient", id); } catch {}
    }
    return id;
  }

  async function hent(sti) {
    const res = await fetch(API + sti, { headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Kunne ikke hente menyen.");
    return data;
  }

  function vinLinje(w) {
    const aar = w.vintage ? ` <span class="aar">${esc(w.vintage)}</span>` : "";
    return `<p class="vin">${esc(w.name)}${aar}${w.region ? `<span class="opphav">${esc(w.region)}</span>` : ""}</p>`;
  }

  const STJERNE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3.1-5.4 3.1 1.2-6L3.3 9.5l6.1-.7z" stroke-linejoin="round"/></svg>';

  function stjerneGruppe(navn, valgt) {
    let html = `<fieldset class="stjerner${navn.liten ? " liten" : ""}" data-for="${esc(navn.key)}"><legend>${esc(navn.label)}</legend>`;
    for (let i = 1; i <= 5; i++) {
      html += `<button type="button" class="stjerne${valgt >= i ? " pa" : ""}" data-verdi="${i}" aria-label="${i} av 5 stjerner" aria-pressed="${valgt === i}">${STJERNE}</button>`;
    }
    return html + "</fieldset>";
  }

  function settStjerner(gruppe, verdi) {
    gruppe.querySelectorAll(".stjerne").forEach((b) => {
      const v = Number(b.dataset.verdi);
      b.classList.toggle("pa", v <= verdi);
      b.setAttribute("aria-pressed", String(v === verdi));
    });
    gruppe.dataset.verdi = String(verdi);
  }

  function feilside(tekst) {
    main.innerHTML = `<section class="melding" role="alert">
      <h1>Menyen lot seg ikke hente</h1>
      <p>${esc(tekst)} Sjekk nettforbindelsen og prøv igjen.</p>
      <button class="knapp" type="button" id="prov-igjen">Prøv igjen</button>
    </section>`;
    document.getElementById("prov-igjen").addEventListener("click", () => location.reload());
  }

  // ---------- Dagens meny ----------
  async function dagensMeny() {
    let meny;
    try { meny = await hent("/today"); } catch (e) { return feilside(e.message); }

    if (!meny || !meny.id) {
      main.innerHTML = `<section class="melding"><h1>Ingen meny ennå</h1><p>Kvelden er ikke satt. Kom tilbake når kortet er klart.</p></section>`;
      return;
    }

    const klient = klientId();
    let mine = {};
    try { mine = await hent(`/mine?client=${klient}&menu=${meny.id}`); } catch {}

    document.title = `${meny.title} – Guldberglia`;

    const retter = (meny.courses || []).map((c) => `
      <li class="rett">
        ${c.course_type ? `<span class="type">${esc(c.course_type)}</span>` : ""}
        <h2 id="rett-${c.id}">${esc(c.dish)}</h2>
        ${c.description ? `<p class="beskrivelse">${esc(c.description)}</p>` : ""}
        ${stjerneGruppe({ key: String(c.id), label: `Din vurdering av ${c.dish}` }, Number(mine[c.id] || 0))}
        <span class="status" aria-live="polite"></span>
        ${(c.wines || []).map((w) => `<div class="vinblokk">
          ${vinLinje(w)}
          ${w.id ? `${stjerneGruppe({ key: "w" + w.id, label: `Din vurdering av vinen ${w.name}`, liten: true }, Number(mine["w" + w.id] || 0))}
          <span class="status" aria-live="polite"></span>` : ""}
        </div>`).join("")}
      </li>`).join("");

    const datoTekst = dato(meny.event_date);
    main.innerHTML = `
      <article class="kort">
        <header class="kort-hode">
          <h1>${esc(meny.title)}</h1>
          ${datoTekst || meny.occasion ? `<p class="dato">${esc([datoTekst, meny.occasion].filter(Boolean).join(", "))}</p>` : ""}
          ${meny.intro ? `<p class="intro">${esc(meny.intro)}</p>` : ""}
        </header>
        <span class="ruter" aria-hidden="true"></span>
        <ol class="retter">${retter}</ol>
        <span class="ruter" aria-hidden="true"></span>
        <section class="kvelden" aria-labelledby="kvelden-tittel">
          <h2 id="kvelden-tittel">Hvordan var kvelden?</h2>
          <p class="hint">Trykk på stjernene under hver rett og hver vin, eller gi en vurdering av hele menyen her.</p>
          <form id="helhet" novalidate>
            ${stjerneGruppe({ key: "menu", label: "Din vurdering av hele menyen" }, Number(mine.menu || 0))}
            <div class="felt">
              <label for="kommentar">Hilsen til kjøkkenet (valgfritt)</label>
              <textarea id="kommentar" name="comment" maxlength="500"></textarea>
            </div>
            <div class="felt">
              <label for="navn">Navn (valgfritt)</label>
              <input id="navn" name="guest_name" maxlength="60" autocomplete="given-name">
            </div>
            <button class="knapp" type="submit">Send vurdering</button>
            <span class="status" aria-live="polite"></span>
          </form>
        </section>
      </article>`;

    const kort = main.querySelector(".kort");
    requestAnimationFrame(() => kort.classList.add("klar"));

    async function send(body) {
      const res = await fetch(API + "/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: klient, menu_id: meny.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Vurderingen ble ikke lagret.");
      return data;
    }

    // Vurdering per rett: lagres med en gang
    main.querySelectorAll(".rett .stjerner").forEach((gruppe) => {
      const status = gruppe.nextElementSibling;
      gruppe.addEventListener("click", async (ev) => {
        const knapp = ev.target.closest(".stjerne");
        if (!knapp) return;
        const verdi = Number(knapp.dataset.verdi);
        const forrige = Number(gruppe.dataset.verdi || mine[gruppe.dataset.for] || 0);
        settStjerner(gruppe, verdi);
        gruppe.setAttribute("aria-busy", "true");
        status.classList.remove("feil");
        status.textContent = "";
        try {
          const nokkel = gruppe.dataset.for;
          await send(nokkel.startsWith("w")
            ? { pairing_id: nokkel.slice(1), stars: verdi }
            : { course_id: nokkel, stars: verdi });
          status.textContent = "Lagret";
        } catch (e) {
          settStjerner(gruppe, forrige);
          status.classList.add("feil");
          status.textContent = e.message;
        } finally {
          gruppe.removeAttribute("aria-busy");
        }
      });
    });

    // Helhetsvurdering
    const skjema = document.getElementById("helhet");
    const helhet = skjema.querySelector(".stjerner");
    const skjemaStatus = skjema.querySelector(".status");
    helhet.dataset.verdi = String(Number(mine.menu || 0));
    helhet.addEventListener("click", (ev) => {
      const knapp = ev.target.closest(".stjerne");
      if (knapp) settStjerner(helhet, Number(knapp.dataset.verdi));
    });
    skjema.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const stars = Number(helhet.dataset.verdi || 0);
      skjemaStatus.classList.remove("feil");
      if (!stars) {
        skjemaStatus.classList.add("feil");
        skjemaStatus.textContent = "Velg antall stjerner først.";
        helhet.querySelector(".stjerne").focus();
        return;
      }
      const knapp = skjema.querySelector(".knapp");
      knapp.disabled = true;
      skjemaStatus.textContent = "Sender …";
      try {
        await send({ course_id: null, stars, comment: skjema.comment.value, guest_name: skjema.guest_name.value });
        skjemaStatus.textContent = "Takk! Vurderingen er lagret.";
        knapp.textContent = "Oppdater vurdering";
      } catch (e) {
        skjemaStatus.classList.add("feil");
        skjemaStatus.textContent = e.message;
      } finally {
        knapp.disabled = false;
      }
    });
  }

  // ---------- Tidligere menyer ----------
  async function arkiv() {
    let menyer;
    try { menyer = await hent("/archive"); } catch (e) { return feilside(e.message); }

    const snitt = (r) => (r && r.count ? `<span class="snitt-stjerne" aria-hidden="true">★</span> ${tall(r.avg)}<span class="visuelt-skjult"> av 5</span> (${r.count})` : "");

    const liste = menyer.length
      ? menyer.map((m) => {
          const retter = m.courses || [];
          const meta = [dato(m.event_date, kortDato), `${retter.length} retter`].filter(Boolean).join(", ");
          return `<li>
            <details>
              <summary>
                <span class="navn">${esc(m.title)}</span>
                <span class="meta">${esc(meta)}${m.rating && m.rating.count ? `<br>${snitt(m.rating)}` : ""}</span>
                <span class="smak">${esc(retter.map((c) => c.dish).join(", "))}</span>
              </summary>
              <ol class="arkivretter">
                ${retter.map((c) => `<li>
                  <span class="r-navn">${esc(c.dish)}</span>
                  <span class="r-snitt">${snitt(c.rating)}</span>
                  ${(c.wines || []).map((w) => `<span class="r-vin">${esc([w.name, w.vintage].filter(Boolean).join(" "))}${w.rating && w.rating.count ? `<span class="r-vinsnitt">${snitt(w.rating)}</span>` : ""}</span>`).join("")}
                </li>`).join("")}
              </ol>
            </details>
          </li>`;
        }).join("")
      : `<li class="melding" style="margin:2rem auto">Ingen tidligere menyer ennå.</li>`;

    main.innerHTML = `
      <section class="arkiv">
        <header>
          <h1>Tidligere menyer</h1>
          <p>Alt som har stått på bordet. Trykk på en meny for å se rettene og hva gjestene syntes.</p>
        </header>
        <ul class="arkivliste">${liste}</ul>
      </section>`;
  }

  // ---------- Vinene vi har drukket ----------
  const NO = {
    Red: "Rød", White: "Hvit", "Rosé": "Rosé", Amber: "Oransje",
    France: "Frankrike", Italy: "Italia", Spain: "Spania", Germany: "Tyskland", Austria: "Østerrike",
    Lebanon: "Libanon", Greece: "Hellas", Hungary: "Ungarn", "South Africa": "Sør-Afrika",
    Switzerland: "Sveits", Slovenia: "Slovenia", Croatia: "Kroatia", Georgia: "Georgia",
    Piedmont: "Piemonte", Burgundy: "Burgund", Tuscany: "Toscana", Sicily: "Sicilia",
    "Loire Valley": "Loire", Sardinia: "Sardinia", Lombardy: "Lombardia", Apulia: "Puglia",
    Campania: "Campania", Alsace: "Alsace", Champagne: "Champagne",
  };
  const no = (s) => (s && NO[s]) || s;
  const kr = (n) => (n == null ? "" : `${Math.round(n).toLocaleString("nb-NO")} kr`);

  const DIMENSJONER = [
    { key: "region", navn: "Region", verdi: (r) => no(r.region) },
    { key: "grape", navn: "Drue", verdi: (r) => r.grape },
    { key: "country", navn: "Land", verdi: (r) => no(r.country) },
    { key: "color", navn: "Farge", verdi: (r) => no(r.color) },
  ];

  async function viner() {
    let alle;
    try { alle = await hent("/drunk"); } catch (e) { return feilside(e.message); }
    alle = alle.map((r) => ({ ...r, _aar: r.date ? Number(String(r.date).slice(0, 4)) : null }));

    if (!alle.length) {
      main.innerHTML = `<section class="melding"><h1>Ingen viner ennå</h1><p>Når flasker blir registrert som drukket i CellarTracker, dukker de opp her.</p></section>`;
      return;
    }

    const tilstand = { dim: "region", sted: "alle", sok: "", sorter: "date", retning: -1, visAlle: false };
    const datoer = alle.map((r) => r.date).filter(Boolean).sort();
    const forste = datoer.length ? dato(datoer[0], new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric" })) : "";

    main.innerHTML = `
      <section class="viner">
        <header class="viner-hode">
          <h1>Vinene vi har drukket</h1>
          <p class="ingress" id="ingress"></p>
        </header>

        <div class="kontroller" role="group" aria-label="Fordel etter">
          <div class="valg" id="dim-valg">
            ${DIMENSJONER.map((d) => `<button type="button" data-dim="${d.key}" aria-pressed="${d.key === tilstand.dim}">${d.navn}</button>`).join("")}
          </div>
          <label class="sted-valg">
            <span class="visuelt-skjult">Hvor</span>
            <select id="sted">
              <option value="alle">Hjemme og ute</option>
              <option value="hjemme">Hjemme</option>
              <option value="restaurant">Restaurant</option>
            </select>
          </label>
        </div>

        <ol class="stolper" id="stolper" aria-label="Antall flasker"></ol>
        <button type="button" class="lenkeknapp" id="vis-alle" hidden></button>
        <p class="fotnote">Pris er kjøpspris der den er registrert, ellers CellarTrackers estimerte verdi (merket ca.).</p>

        <div class="liste-hode">
          <h2>Alle flaskene</h2>
          <label class="sok">
            <span class="visuelt-skjult">Søk i vinene</span>
            <input type="search" id="sok" placeholder="Søk etter vin, drue eller region" autocomplete="off">
          </label>
        </div>
        <div class="tabell-ramme">
          <table class="vintabell">
            <thead>
              <tr>
                <th scope="col"><button type="button" data-sort="date">Drukket</button></th>
                <th scope="col"><button type="button" data-sort="name">Vin</button></th>
                <th scope="col"><button type="button" data-sort="grape">Drue</button></th>
                <th scope="col"><button type="button" data-sort="region">Region</button></th>
                <th scope="col" class="tall"><button type="button" data-sort="age">Alder</button></th>
                <th scope="col" class="tall"><button type="button" data-sort="price">Pris</button></th>
              </tr>
            </thead>
            <tbody id="rader"></tbody>
          </table>
        </div>
        <p class="tom" id="tom" hidden>Ingen viner passer søket.</p>
      </section>`;

    const $ = (id) => document.getElementById(id);

    function utvalg() {
      return alle.filter((r) => tilstand.sted === "alle" || r.place === tilstand.sted);
    }

    function tegnIngress(rader) {
      const dim = DIMENSJONER.find((d) => d.key === "region");
      const topp = gruppe(rader, dim)[0];
      const druer = gruppe(rader, DIMENSJONER[1])[0];
      const deler = [`${rader.length} flasker${forste ? ` siden ${forste}` : ""}.`];
      if (topp) deler.push(`Oftest fra ${topp.navn}${druer ? `, og ${druer.navn} er druen som går igjen.` : "."}`);
      $("ingress").textContent = deler.join(" ");
    }

    function gruppe(rader, dim) {
      const m = new Map();
      for (const r of rader) {
        const k = dim.verdi(r) || "Ukjent";
        const g = m.get(k) || { navn: k, antall: 0, sum: 0, medPris: 0 };
        g.antall++;
        if (r.price != null) { g.sum += r.price; g.medPris++; }
        m.set(k, g);
      }
      return [...m.values()]
        .map((g) => ({ ...g, snitt: g.medPris ? g.sum / g.medPris : null }))
        .sort((a, b) => b.antall - a.antall || a.navn.localeCompare(b.navn, "nb"));
    }

    function tegnStolper() {
      const rader = utvalg();
      const dim = DIMENSJONER.find((d) => d.key === tilstand.dim);
      const grupper = gruppe(rader, dim);
      const vis = tilstand.visAlle ? grupper : grupper.slice(0, 10);
      const maks = grupper[0] ? grupper[0].antall : 1;
      const total = rader.length || 1;
      $("stolper").innerHTML = vis.map((g) => {
        const andel = Math.round((g.antall / total) * 100);
        return `<li class="stolpe" title="${esc(`${g.navn}: ${g.antall} flasker (${andel} %)${g.snitt ? `, snittpris ca. ${kr(g.snitt)}` : ""}`)}">
          <span class="s-navn">${esc(g.navn)}</span>
          <span class="s-spor" aria-hidden="true"><span class="s-fyll" style="width:${Math.max(2, (g.antall / maks) * 100)}%"></span></span>
          <span class="s-tall">${g.antall}<span class="s-andel">${andel} %</span></span>
          <span class="s-pris">${g.snitt ? `snitt ${kr(g.snitt)}` : ""}</span>
        </li>`;
      }).join("");
      const knapp = $("vis-alle");
      knapp.hidden = grupper.length <= 10;
      knapp.textContent = tilstand.visAlle ? "Vis bare de ti største" : `Vis alle ${grupper.length}`;
      tegnIngress(rader);
    }

    function tegnTabell() {
      const q = tilstand.sok.trim().toLowerCase();
      let rader = utvalg();
      if (q) {
        rader = rader.filter((r) => [r.name, r.grape, r.varietal, no(r.region), r.region, no(r.country), r.appellation, r.vintage]
          .filter(Boolean).join(" ").toLowerCase().includes(q));
      }
      const k = tilstand.sorter, d = tilstand.retning;
      rader = [...rader].sort((a, b) => {
        const va = k === "region" ? no(a.region) : a[k], vb = k === "region" ? no(b.region) : b[k];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "nb")) * d;
      });
      const kortDato2 = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", year: "numeric" });
      $("rader").innerHTML = rader.map((r) => `<tr>
        <td data-l="Drukket">${esc(dato(r.date, kortDato2))}${r.place === "restaurant" ? ' <span class="merke">restaurant</span>' : ""}</td>
        <td data-l="Vin" class="v-navn">${esc(r.name)}${r.vintage ? ` <span class="aar">${r.vintage}</span>` : ""}</td>
        <td data-l="Drue">${esc(r.grape || "")}</td>
        <td data-l="Region">${esc([no(r.region), r.appellation && r.appellation !== r.region ? r.appellation : null].filter(Boolean).join(", "))}</td>
        <td data-l="Alder" class="tall">${r.age != null ? `${r.age} år` : ""}</td>
        <td data-l="Pris" class="tall">${r.price != null ? `${r.price_kind === "estimert" ? "ca. " : ""}${kr(r.price)}` : ""}</td>
      </tr>`).join("");
      $("tom").hidden = rader.length > 0;
      document.querySelectorAll(".vintabell th").forEach((th) => {
        const b = th.querySelector("button");
        th.setAttribute("aria-sort", b.dataset.sort === k ? (d === 1 ? "ascending" : "descending") : "none");
      });
    }

    $("dim-valg").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-dim]");
      if (!b) return;
      tilstand.dim = b.dataset.dim;
      tilstand.visAlle = false;
      $("dim-valg").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      tegnStolper();
    });
    $("sted").addEventListener("change", (ev) => { tilstand.sted = ev.target.value; tegnStolper(); tegnTabell(); });
    $("vis-alle").addEventListener("click", () => { tilstand.visAlle = !tilstand.visAlle; tegnStolper(); });
    $("sok").addEventListener("input", (ev) => { tilstand.sok = ev.target.value; tegnTabell(); });
    document.querySelector(".vintabell thead").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-sort]");
      if (!b) return;
      const k = b.dataset.sort;
      tilstand.retning = tilstand.sorter === k ? -tilstand.retning : (k === "name" || k === "grape" || k === "region" ? 1 : -1);
      tilstand.sorter = k;
      tegnTabell();
    });

    tegnStolper();
    tegnTabell();
  }

  ({ arkiv, viner }[side] || dagensMeny)();
})();
