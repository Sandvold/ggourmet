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

  (side === "arkiv" ? arkiv : dagensMeny)();
})();
