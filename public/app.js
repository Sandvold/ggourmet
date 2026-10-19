(() => {
  const API = (window.GOURMET_API || "").replace(/\/+$/, "");
  const main = document.getElementById("innhold");
  const side = document.body.dataset.side;

  // ---------- Hjelpere ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nr = (n) => String(n).padStart(2, "0");

  const langDato = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const kortDato = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", year: "numeric" });
  function dato(iso, fmt = langDato) {
    if (!iso) return "";
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    if (!y) return "";
    return fmt.format(new Date(y, m - 1, d));
  }
  const tall1 = (n) => Number(n).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const kr = (n) => (n == null ? "" : `${Math.round(n).toLocaleString("nb-NO")} kr`);

  const NO = {
    Red: "Rød", White: "Hvit", "Rosé": "Rosé", Amber: "Oransje",
    France: "Frankrike", Italy: "Italia", Spain: "Spania", Germany: "Tyskland", Austria: "Østerrike",
    Lebanon: "Libanon", "United Kingdom": "Storbritannia", Greece: "Hellas", Hungary: "Ungarn", "South Africa": "Sør-Afrika",
    Switzerland: "Sveits", Croatia: "Kroatia",
    Piedmont: "Piemonte", Burgundy: "Burgund", Tuscany: "Toscana", Sicily: "Sicilia",
    "Loire Valley": "Loire", Lombardy: "Lombardia", Apulia: "Puglia",
  };
  const no = (s) => (s && NO[s]) || s;
  const opphav = (w) => [w.region && w.region !== w.appellation ? w.appellation : null, no(w.region), no(w.country)]
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");

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
    if (!res.ok) throw new Error(data.error || "Kunne ikke hente data.");
    return data;
  }

  function feilside(tekst) {
    main.innerHTML = `<section class="melding" role="alert">
      <h1>Siden lot seg ikke hente</h1>
      <p>${esc(tekst)} Sjekk nettforbindelsen og prøv igjen.</p>
      <button class="knapp" type="button" id="prov-igjen">Prøv igjen</button>
    </section>`;
    document.getElementById("prov-igjen").addEventListener("click", () => location.reload());
  }

  // Fem ruter i stedet for stjerner
  function ruter(key, label, valgt, liten) {
    let html = `<fieldset class="ruter${liten ? " liten" : ""}" data-for="${esc(key)}" data-verdi="${valgt || 0}"><legend>${esc(label)}</legend>`;
    for (let i = 1; i <= 5; i++) {
      html += `<button type="button" class="rute${valgt >= i ? " pa" : ""}" data-verdi="${i}" aria-label="${i} av 5" aria-pressed="${valgt === i}"></button>`;
    }
    return html + "</fieldset>";
  }
  function settRuter(gruppe, verdi) {
    gruppe.querySelectorAll(".rute").forEach((b) => {
      const v = Number(b.dataset.verdi);
      b.classList.toggle("pa", v <= verdi);
      b.setAttribute("aria-pressed", String(v === verdi));
    });
    gruppe.dataset.verdi = String(verdi);
  }

  // ---------- Dagens meny ----------
  async function dagensMeny() {
    let meny;
    try { meny = await hent("/today"); } catch (e) { return feilside(e.message); }
    if (!meny || !meny.id) {
      main.innerHTML = `<section class="melding"><h1>Ingen meny ennå</h1><p>Kvelden er ikke satt. Kom tilbake når menyen er klar.</p></section>`;
      return;
    }

    const klient = klientId();
    let mine = {};
    try { mine = await hent(`/mine?client=${klient}&menu=${meny.id}`); } catch {}
    document.title = `${meny.title} – Guldberglia`;

    const retter = meny.courses || [];
    const antallViner = new Set(retter.flatMap((c) => (c.wines || []).map((w) => `${w.name}|${w.vintage}`))).size;
    const datoTekst = dato(meny.event_date);

    const kort = retter.map((c, i) => `
      <li class="rett" id="rett-${c.position}" style="--i:${i}">
        <div class="rett-topp">
          <div><span class="nr">${nr(c.position)}</span>${c.course_type ? `<span class="type">${esc(c.course_type)}</span>` : ""}</div>
          <h2>${esc(c.dish)}</h2>
          ${c.description ? `<p class="beskrivelse">${esc(c.description)}</p>` : ""}
          <div class="vurder">
            ${ruter(String(c.id), `Din vurdering av ${c.dish}`, Number(mine[c.id] || 0))}
            <span class="status" aria-live="polite"></span>
          </div>
        </div>
        ${(c.wines || []).map((w) => `
          <div class="vin">
            <p class="vin-navn">${esc(w.name)}${w.vintage ? ` <span class="aar">${esc(w.vintage)}</span>` : ""}</p>
            ${opphav(w) ? `<p class="vin-opphav">${esc(opphav(w))}</p>` : ""}
            ${w.id ? `<div class="vurder">
              ${ruter("w" + w.id, `Din vurdering av vinen ${w.name}`, Number(mine["w" + w.id] || 0), true)}
              <span class="status" aria-live="polite"></span>
            </div>` : ""}
          </div>`).join("")}
      </li>`).join("");

    main.innerHTML = `
      <section class="side">
        <header class="hode">
          <h1>${esc(meny.title)}</h1>
          <p class="h-meta">${datoTekst ? `<strong>${esc(datoTekst)}</strong>` : ""}${retter.length} retter${antallViner ? `, ${antallViner} viner` : ""}</p>
          ${meny.intro ? `<p class="ingress">${esc(meny.intro)}</p>` : ""}
        </header>
        <div class="stripe">
          <ol aria-label="Rettene">${retter.map((c) => `<li${mine[c.id] ? ' class="vurdert"' : ""} data-for="${c.id}"><a href="#rett-${c.position}" title="${esc(`${nr(c.position)} ${c.dish}`)}">${esc(c.dish)}</a></li>`).join("")}</ol>
          <span id="telling"></span>
        </div>
        <ol class="retter">${kort}</ol>
      </section>`;

    const telling = document.getElementById("telling");
    const oppdaterTelling = () => {
      const n = main.querySelectorAll(".stripe li.vurdert").length;
      telling.textContent = n ? `${n} av ${retter.length} vurdert` : "Trykk på rutene for å vurdere rett og vin";
    };
    oppdaterTelling();
    requestAnimationFrame(() => main.querySelector(".retter").classList.add("klar"));

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

    main.querySelectorAll(".rett .ruter").forEach((gruppe) => {
      const status = gruppe.nextElementSibling;
      let tidtaker;
      gruppe.addEventListener("click", async (ev) => {
        const knapp = ev.target.closest(".rute");
        if (!knapp) return;
        const verdi = Number(knapp.dataset.verdi);
        const forrige = Number(gruppe.dataset.verdi || 0);
        const nokkel = gruppe.dataset.for;
        settRuter(gruppe, verdi);
        gruppe.setAttribute("aria-busy", "true");
        status.classList.remove("feil");
        status.textContent = "";
        clearTimeout(tidtaker);
        try {
          await send(nokkel.startsWith("w") ? { pairing_id: nokkel.slice(1), stars: verdi } : { course_id: nokkel, stars: verdi });
          status.textContent = "Lagret";
          tidtaker = setTimeout(() => { status.textContent = ""; }, 2500);
          if (!nokkel.startsWith("w")) {
            const li = main.querySelector(`.stripe li[data-for="${nokkel}"]`);
            if (li) li.classList.add("vurdert");
            oppdaterTelling();
          }
        } catch (e) {
          settRuter(gruppe, forrige);
          status.classList.add("feil");
          status.textContent = e.message;
        } finally {
          gruppe.removeAttribute("aria-busy");
        }
      });
    });
  }

  // ---------- Tidligere menyer ----------
  const snitt = (r) => (r && r.count ? `<span class="snitt">${tall1(r.avg)} av 5 (${r.count})</span>` : "");

  async function arkiv() {
    let menyer;
    try { menyer = await hent("/archive"); } catch (e) { return feilside(e.message); }

    const liste = menyer.length
      ? menyer.map((m) => {
          const retter = m.courses || [];
          const meta = [dato(m.event_date, kortDato), `${retter.length} retter`].filter(Boolean).join(", ");
          return `<li>
            <details>
              <summary>
                <span class="a-nr">${nr(m.menu_no)}</span>
                <span class="a-navn">${esc(m.title)}<span class="a-smak">${esc(retter.map((c) => c.dish).join(", "))}</span></span>
                <span class="a-meta">${esc(meta)}${m.rating && m.rating.count ? `<br>${snitt(m.rating)}` : ""}</span>
              </summary>
              <ol class="arkivretter">
                ${retter.map((c) => `<li>
                  <span class="ar-nr">${nr(c.position)}</span> ${snitt(c.rating)}
                  <span class="ar-navn">${esc(c.dish)}</span>
                  ${(c.wines || []).map((w) => `<span class="ar-vin">${esc([w.name, w.vintage].filter(Boolean).join(" "))} ${snitt(w.rating)}</span>`).join("")}
                </li>`).join("")}
              </ol>
            </details>
          </li>`;
        }).join("")
      : `<li class="melding">Ingen tidligere menyer ennå.</li>`;

    main.innerHTML = `
      <section class="side">
        <header class="hode">
          <h1>Tidligere menyer</h1>
          <p class="h-meta"><strong>${menyer.length} menyer</strong>${menyer.reduce((n, m) => n + (m.courses || []).length, 0)} retter</p>
          <p class="ingress">Alt som har stått på bordet. Åpne en meny for å se rettene, vinene og hva gjestene syntes.</p>
        </header>
        <ul class="arkivliste">${liste}</ul>
      </section>`;
  }

  // ---------- Vinene fra menyene ----------
  const DIMENSJONER = [
    { key: "region", navn: "Region", verdi: (r) => no(r.region) },
    { key: "grape", navn: "Drue", verdi: (r) => r.grape },
    { key: "country", navn: "Land", verdi: (r) => no(r.country) },
    { key: "color", navn: "Farge", verdi: (r) => no(r.color) },
  ];

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

  async function viner() {
    let alle;
    try { alle = await hent("/drunk"); } catch (e) { return feilside(e.message); }

    if (!alle.length) {
      main.innerHTML = `<section class="melding"><h1>Ingen viner ennå</h1><p>Når vinene til en meny er lagt inn, dukker de opp her.</p></section>`;
      return;
    }

    const medPris = alle.filter((r) => r.price != null);
    const snittPris = medPris.length ? medPris.reduce((s, r) => s + r.price, 0) / medPris.length : null;
    const toppRegion = gruppe(alle, DIMENSJONER[0])[0];
    const toppDrue = gruppe(alle, DIMENSJONER[1])[0];
    const menyer = new Set(alle.map((r) => r.menu_no)).size;

    const tilstand = { dim: "region", sok: "", sorter: "menu_no", retning: -1, visAlle: false };

    main.innerHTML = `
      <section class="side">
        <header class="hode">
          <h1>Vinene</h1>
          <p class="h-meta"><strong>${alle.length} viner</strong>fra ${menyer} ${menyer === 1 ? "meny" : "menyer"}</p>
          <p class="ingress">Alt som er servert til menyene, sortert etter hvor det kommer fra og hva det er laget av.</p>
        </header>

        <dl class="nokkeltall">
          <div><dt>Mest servert fra</dt><dd>${esc(toppRegion ? toppRegion.navn : "–")}</dd></div>
          <div><dt>Vanligste drue</dt><dd>${esc(toppDrue ? toppDrue.navn : "–")}</dd></div>
          <div><dt>Snittpris per flaske</dt><dd>${snittPris ? `ca. ${kr(snittPris)}` : "–"}</dd></div>
        </dl>

        <div class="kontroller">
          <div class="valg" id="dim-valg" role="group" aria-label="Fordel etter">
            ${DIMENSJONER.map((d) => `<button type="button" data-dim="${d.key}" aria-pressed="${d.key === tilstand.dim}">${d.navn}</button>`).join("")}
          </div>
        </div>
        <ol class="stolper" id="stolper" aria-label="Antall viner"></ol>
        <button type="button" class="lenkeknapp" id="vis-alle" hidden></button>
        <p class="fotnote">Pris er kjøpspris der den er registrert, ellers CellarTrackers estimerte verdi (merket ca.).</p>

        <div class="liste-hode">
          <h2>Alle vinene</h2>
          <label>
            <span class="visuelt-skjult">Søk i vinene</span>
            <input type="search" id="sok" placeholder="Søk etter vin, drue eller region" autocomplete="off">
          </label>
        </div>
        <div class="tabell-ramme">
          <table class="vintabell">
            <thead>
              <tr>
                <th scope="col"><button type="button" data-sort="menu_no">Meny</button></th>
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

    function tegnStolper() {
      const dim = DIMENSJONER.find((d) => d.key === tilstand.dim);
      const grupper = gruppe(alle, dim);
      const vis = tilstand.visAlle ? grupper : grupper.slice(0, 10);
      const maks = grupper[0] ? grupper[0].antall : 1;
      $("stolper").innerHTML = vis.map((g) => {
        const andel = Math.round((g.antall / alle.length) * 100);
        return `<li class="stolpe" title="${esc(`${g.navn}: ${g.antall} (${andel} %)${g.snitt ? `, snittpris ca. ${kr(g.snitt)}` : ""}`)}">
          <span class="s-navn">${esc(g.navn)}</span>
          <span class="s-spor" aria-hidden="true"><span class="s-fyll" style="width:${Math.max(2, (g.antall / maks) * 100)}%"></span></span>
          <span class="s-tall">${g.antall}<span class="s-andel">${andel} %</span></span>
          <span class="s-pris">${g.snitt ? `ca. ${kr(g.snitt)}` : ""}</span>
        </li>`;
      }).join("");
      const knapp = $("vis-alle");
      knapp.hidden = grupper.length <= 10;
      knapp.textContent = tilstand.visAlle ? "Vis bare de ti største" : `Vis alle ${grupper.length}`;
    }

    function tegnTabell() {
      const q = tilstand.sok.trim().toLowerCase();
      let rader = alle;
      if (q) {
        rader = rader.filter((r) => [r.name, r.grape, r.varietal, no(r.region), r.region, no(r.country), r.appellation, r.vintage, r.menu]
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
      $("rader").innerHTML = rader.map((r) => `<tr>
        <td data-l="Meny">${esc(r.menu || "")}</td>
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
    $("vis-alle").addEventListener("click", () => { tilstand.visAlle = !tilstand.visAlle; tegnStolper(); });
    $("sok").addEventListener("input", (ev) => { tilstand.sok = ev.target.value; tegnTabell(); });
    document.querySelector(".vintabell thead").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-sort]");
      if (!b) return;
      const k = b.dataset.sort;
      tilstand.retning = tilstand.sorter === k ? -tilstand.retning : (["name", "grape", "region"].includes(k) ? 1 : -1);
      tilstand.sorter = k;
      tegnTabell();
    });

    tegnStolper();
    tegnTabell();
  }

  ({ arkiv, viner }[side] || dagensMeny)();
})();
