#!/usr/bin/env python3
"""Forhåndsvisning av nettsiden med testdata.

Starter en lokal server som serverer public/ og et falskt API, og tar skjermbilder
(mobil og PC) av dagens meny, vinene og tidligere menyer med Playwright.

    pip install playwright && python -m playwright install chromium
    python tools/preview.py            # bilder i preview-out/
    python tools/preview.py --tbd      # forsiden uten dagens meny
    python tools/preview.py --serve    # bare server, åpne http://127.0.0.1:8770
"""
import argparse
import asyncio
import http.server
import json
import pathlib
import threading
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
PORT = 8770


def rett(cid, pos, dish, wines=(), rating=None):
    return {
        "id": cid, "position": pos, "dish": dish, "course_type": None, "description": None,
        "rating": rating or {"avg": None, "count": 0},
        "wines": [{"id": 500 + cid * 10 + i, **w, "rating": {"avg": None, "count": 0}} for i, w in enumerate(wines)],
    }


VIN = {
    "musar": {"name": "Chateau Musar", "vintage": 2015, "region": "Bekaa Valley", "country": "Lebanon", "appellation": None},
    "savennieres": {"name": "Eric Morgat Savennières Clos Serteaux", "vintage": 2019, "region": "Loire Valley", "country": "France", "appellation": "Savennières"},
    "barbaresco": {"name": "Produttori del Barbaresco Barbaresco Riserva Pora", "vintage": 2014, "region": "Piedmont", "country": "Italy", "appellation": "Barbaresco"},
    "champagne": {"name": "Champagne", "vintage": None, "region": "Champagne", "country": "France", "appellation": None},
}

TODAY = {
    "id": 9, "menu_no": 9, "title": "Meny 9", "event_date": "2026-11-08", "occasion": None,
    "intro": None, "rating": {"avg": None, "count": 0},
    "courses": [
        rett(1, 1, "Teriyaki-blini med yuzukaviar", [VIN["champagne"]]),
        rett(2, 2, "Carpaccio av kveite med fennikel", [VIN["savennieres"]]),
        rett(3, 3, "Kyllingkraft med grønn curry"),
        rett(4, 4, "Andebryst i tamarindsaus", [VIN["musar"]]),
        rett(5, 5, "Wagyu med blåmuggost", [VIN["barbaresco"], VIN["musar"]]),
    ],
}

ARKIV = [
    {"id": 5, "menu_no": 5, "title": "Meny 5", "event_date": "2023-08-26", "rating": {"avg": 4.6, "count": 5},
     "courses": [rett(11, 1, "Halloumi, fersken og serrano", [VIN["champagne"]], {"avg": 4.5, "count": 4}),
                 rett(12, 2, "Crudo av fjellørret", [VIN["savennieres"]]),
                 rett(13, 3, "Norsk wagyu, T-bone", [VIN["musar"], VIN["barbaresco"]])]},
    {"id": 4, "menu_no": 4, "title": "Meny 4", "event_date": None, "rating": {"avg": None, "count": 0},
     "courses": [rett(21, 1, "Artisjokkpuré med chilimarinert agurk"), rett(22, 2, "Hamachi: crudo, ceviche, sashimi")]},
]

DRUKKET = [
    {"menu": "Meny 5", "menu_no": 5, "date": "2023-08-26", "color": "Red", "grape": "Red Blend", "price": 706,
     "price_kind": "estimert", "age": 8, "rating": 4.5, "rating_count": 2, **VIN["musar"]},
    {"menu": "Meny 5", "menu_no": 5, "date": "2023-08-26", "color": "White", "grape": "Chenin Blanc", "price": 1131,
     "price_kind": "estimert", "age": 4, "rating": 4.0, "rating_count": 3, **VIN["savennieres"]},
    {"menu": "Meny 5", "menu_no": 5, "date": "2023-08-26", "color": "Red", "grape": "Nebbiolo", "price": 643,
     "price_kind": "estimert", "age": 9, "rating": None, "rating_count": 0, **VIN["barbaresco"]},
    {"menu": "Meny 4", "menu_no": 4, "date": None, "color": "White", "grape": "Champagne Blend", "price": None,
     "price_kind": None, "age": None, "rating": 3.5, "rating_count": 1, **VIN["champagne"]},
]


def lag_handler(tbd):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(ROOT), **k)

        def log_message(self, *a):
            pass

        def svar(self, data, kode=200, typ="application/json"):
            b = data if isinstance(data, bytes) else json.dumps(data).encode()
            self.send_response(kode)
            self.send_header("Content-Type", typ)
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self):
            sti = urllib.parse.urlparse(self.path).path
            if sti == "/config.js":
                return self.svar(b'window.GOURMET_API="/api";', typ="text/javascript")
            api = {"/api/today": None if tbd else TODAY, "/api/archive": ARKIV, "/api/drunk": DRUKKET,
                   "/api/mine": {"1": 4.5, "502": 3.5}}
            if sti in api:
                return self.svar(api[sti])
            if sti in ("/arkiv", "/viner"):
                self.path = sti + ".html"
            return super().do_GET()

        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            return self.svar({"ok": True, "rating": {"avg": 4.5, "count": 1}})

    return Handler


async def ta_bilder(ut):
    from playwright.async_api import async_playwright

    sider = [("dagens", "/"), ("viner", "/viner"), ("arkiv", "/arkiv")]
    visninger = [("mobil", 390, 844, 2), ("pc", 1280, 900, 1)]
    async with async_playwright() as p:
        nettleser = await p.chromium.launch()
        for navn, sti in sider:
            for vis, b, h, skala in visninger:
                side = await nettleser.new_page(viewport={"width": b, "height": h}, device_scale_factor=skala)
                await side.goto(f"http://127.0.0.1:{PORT}{sti}")
                await side.wait_for_timeout(1200)
                fil = ut / f"{navn}-{vis}.png"
                await side.screenshot(path=str(fil), full_page=True)
                bredde = await side.evaluate("document.documentElement.scrollWidth")
                varsel = f"  ADVARSEL: siden er {bredde}px bred (overflyt)" if bredde > b else ""
                print(f"{fil}{varsel}")
                await side.close()
        await nettleser.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ut", default="preview-out", help="mappe for skjermbildene")
    ap.add_argument("--tbd", action="store_true", help="vis forsiden uten dagens meny")
    ap.add_argument("--serve", action="store_true", help="bare start serveren")
    args = ap.parse_args()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), lag_handler(args.tbd))
    if args.serve:
        print(f"Forhåndsvisning på http://127.0.0.1:{PORT} (Ctrl+C for å stoppe)")
        server.serve_forever()
        return
    threading.Thread(target=server.serve_forever, daemon=True).start()
    ut = pathlib.Path(args.ut)
    ut.mkdir(parents=True, exist_ok=True)
    try:
        asyncio.run(ta_bilder(ut))
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
