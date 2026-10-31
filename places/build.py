#!/usr/bin/env python3
"""Build places/index.html (self-contained map app) plus KML/CSV exports from data/places.json.

Usage: python3 places/build.py
Outputs:
  places/index.html     open in a browser or publish; location-aware map
  places/my-places.kml  import into Google My Maps (mymaps.google.com > Import)
  places/my-places.csv  same, as CSV
"""
import csv, json, pathlib, urllib.parse
from xml.sax.saxutils import escape

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "places.json"
OUT = ROOT / "places"

def gmaps(p):
    q = p.get("gmaps_query") or ", ".join(x for x in (p["name"], p.get("address") or p.get("city")) if x)
    return "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(q)

def main():
    data = json.loads(DATA.read_text())
    places = data["places"]
    cats = data["categories"]
    cat_ids = {c["id"] for c in cats}
    label = {c["id"]: c["label"] for c in cats}
    ids = [p["id"] for p in places]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SystemExit(f"duplicate ids: {sorted(dupes)}")
    for p in places:
        for k in ("id", "name", "lat", "lng"):
            if p.get(k) in (None, ""):
                raise SystemExit(f"{p.get('id', '?')}: missing {k}")
        if p.get("category") not in cat_ids:
            raise SystemExit(f"{p['id']}: unknown category {p.get('category')!r} (add it to categories[] first)")

    seed = json.dumps({"categories": cats, "places": places}, ensure_ascii=False).replace("</", "<\\/")
    html = (OUT / "app.html").read_text().replace("/*__PLACES__*/null", seed, 1)
    (OUT / "index.html").write_text(html)

    def kml_color(h):  # KML colors are aabbggrr
        return "ff" + h[5:7] + h[3:5] + h[1:3]
    used = [c for c in cats if any(p["category"] == c["id"] for p in places)]
    kml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>My Places</name>']
    for c in used:
        kml.append(f'<Style id="cat-{c["id"]}"><IconStyle><color>{kml_color(c["color"])}</color></IconStyle></Style>')
    for c in used:
        kml.append(f"<Folder><name>{escape(c['label'])}</name>")
        for p in (p for p in places if p["category"] == c["id"]):
            desc = "\n".join(x for x in (c["label"], p.get("address"), p.get("notes"), gmaps(p)) if x)
            name = ("★ " if p.get("starred") else "") + p["name"]
            kml.append(f"<Placemark><name>{escape(name)}</name><styleUrl>#cat-{c['id']}</styleUrl>"
                       f"<description>{escape(desc)}</description>"
                       f"<Point><coordinates>{p['lng']},{p['lat']},0</coordinates></Point></Placemark>")
        kml.append("</Folder>")
    kml.append("</Document></kml>")
    (OUT / "my-places.kml").write_text("\n".join(kml) + "\n")

    with open(OUT / "my-places.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["name", "category", "starred", "address", "city", "latitude", "longitude", "notes", "google_maps_url"])
        for p in places:
            w.writerow([p["name"], label[p["category"]], "yes" if p.get("starred") else "", p.get("address", ""), p.get("city", ""),
                        p["lat"], p["lng"], p.get("notes", ""), gmaps(p)])

    print(f"built {len(places)} places -> places/index.html, my-places.kml, my-places.csv")

if __name__ == "__main__":
    main()
