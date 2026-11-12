#!/usr/bin/env python3
"""Merge a my-places-changes.json exported from the app into data/places.json, then rebuild.

Usage: python3 places/merge_changes.py path/to/my-places-changes.json
"""
import datetime, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "places.json"

def main(path):
    ch = json.loads(pathlib.Path(path).read_text())
    data = json.loads(DATA.read_text())
    cats, places = data["categories"], data["places"]
    cat_ids = {c["id"] for c in cats}

    new_cats = 0
    for c in ch.get("new_categories", []):
        if c["id"] in cat_ids:
            continue
        c = {k: c[k] for k in ("id", "label", "color", "icon", "keywords") if k in c}
        cats.insert(len(cats) - 1 if cats and cats[-1]["id"] == "other" else len(cats), c)
        cat_ids.add(c["id"]); new_cats += 1

    by_id = {p["id"]: p for p in places}
    edited = 0
    removed = 0
    for pid, fields in ch.get("edits", {}).items():
        if pid in by_id:
            by_id[pid].update({k: v for k, v in fields.items() if k in ("category", "starred")}); edited += 1
            # review decisions from the Recently added page: Remove deletes the place, Approve keeps it
            if fields.get("review") == "removed":
                places.remove(by_id.pop(pid)); removed += 1
            elif fields.get("review") == "approved":
                by_id[pid]["review"] = "approved"; by_id[pid].pop("review_note", None)

    added = skipped = 0
    seen_urls = {p.get("google_maps_url") for p in places if p.get("google_maps_url")}
    seen_names = {(p["name"].lower(), round(p["lat"], 3), round(p["lng"], 3)) for p in places}
    for p in ch.get("new_places", []):
        key = (p["name"].lower(), round(p["lat"], 3), round(p["lng"], 3))
        if p["id"] in by_id or (p.get("google_maps_url") and p["google_maps_url"] in seen_urls) or key in seen_names:
            skipped += 1; continue
        if p.get("category") not in cat_ids:
            p["category"] = "other"
        p = {k: v for k, v in p.items() if v not in (None, "", [])} | {"lat": p["lat"], "lng": p["lng"], "starred": bool(p.get("starred"))}
        places.append(p); by_id[p["id"]] = p; seen_names.add(key); added += 1

    data["_meta"]["last_updated"] = datetime.date.today().isoformat()
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"merged: +{added} places ({skipped} duplicates skipped), {edited} edits ({removed} removed in review), +{new_cats} categories")
    subprocess.run([sys.executable, str(ROOT / "places" / "build.py")], check=True)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
