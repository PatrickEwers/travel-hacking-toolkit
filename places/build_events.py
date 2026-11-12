#!/usr/bin/env python3
"""Build places/events-data.js (data for the Walkabout Events tab) from data/events.json.

Usage:
  python3 places/build_events.py                    validate + build
  python3 places/build_events.py --merge found.json merge a JSON array of found events, then build
  python3 places/build_events.py --prune            also drop one-off events that ended before the trip

--merge: events without an id get one from the title (+ date). An existing id is updated in place
(keeps `added`, sets `verified` to today); a new id is appended with `added` = `verified` = today.
"""
import datetime, json, pathlib, re, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "events.json"
PLACES = ROOT / "data" / "places.json"
OUT = ROOT / "places" / "events-data.js"
WEEKDAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME = re.compile(r"^\d{2}:\d{2}$")
FIELDS = ["id", "title", "type", "goals", "date", "end_date", "recurring", "time", "end_time", "venue", "area", "address",
          "lat", "lng", "place_id", "gmaps_query", "price", "organizer", "url", "notes", "confidence", "added", "verified"]

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]

def is_date(s):
    if not (isinstance(s, str) and DATE.match(s)):
        return False
    try:
        datetime.date.fromisoformat(s)
        return True
    except ValueError:
        return False

def check(ev, type_ids, place_ids):
    def fail(msg):
        raise SystemExit(f"{ev.get('id') or ev.get('title') or '?'}: {msg}")
    for k in ("id", "title", "type", "url"):
        if not ev.get(k):
            fail(f"missing {k}")
    if ev["type"] not in type_ids:
        fail(f"unknown type {ev['type']!r}")
    goals = ev.get("goals") or []
    if not set(goals) <= type_ids:
        fail(f"unknown goal in {goals}")
    if ev["type"] not in goals:
        fail("goals[] must include the event's type")
    if bool(ev.get("date")) == bool(ev.get("recurring")):
        fail("set exactly one of date / recurring")
    for k in ("date", "end_date"):
        if ev.get(k) and not is_date(ev[k]):
            fail(f"bad {k} {ev[k]!r}")
    if ev.get("end_date") and (not ev.get("date") or ev["end_date"] < ev["date"]):
        fail("end_date needs a date on or before it")
    for k in ("time", "end_time"):
        if ev.get(k) and not TIME.match(ev[k]):
            fail(f"bad {k} {ev[k]!r} (want HH:MM)")
    r = ev.get("recurring")
    if r:
        if r.get("freq") == "weekly":
            if not r.get("weekdays") or not set(r["weekdays"]) <= WEEKDAYS:
                fail(f"bad weekdays {r.get('weekdays')}")
        elif r.get("freq") == "monthly":
            if r.get("weekday") not in WEEKDAYS or r.get("nth") not in (1, 2, 3, 4, -1):
                fail(f"bad monthly rule {r}")
        elif r.get("freq") != "daily":
            fail(f"bad freq {r.get('freq')!r}")
        for k in ("from", "until"):
            if r.get(k) and not is_date(r[k]):
                fail(f"bad recurring.{k}")
    if ev.get("confidence") not in ("confirmed", "likely"):
        fail("confidence must be confirmed or likely")
    if ev.get("place_id") and ev["place_id"] not in place_ids:
        fail(f"place_id {ev['place_id']!r} is not in data/places.json")

def clean(ev):
    ev = {k: v for k, v in ev.items() if v not in (None, "", [])}
    if "goals" in ev:
        ev["goals"] = list(dict.fromkeys(ev["goals"]))
    return {k: ev[k] for k in FIELDS if k in ev} | {k: v for k, v in ev.items() if k not in FIELDS}

def merge(data, found, today):
    by_id = {e["id"]: e for e in data["events"]}
    added = updated = 0
    for ev in found:
        ev = clean(ev)
        if not ev.get("id"):
            ev["id"] = slug(ev.get("title", "")) + ("-" + ev["date"] if ev.get("date") else "")
        old = by_id.get(ev["id"])
        ev["verified"] = today
        if old:
            ev["added"] = old.get("added", today)
            old.clear(); old.update(clean(ev)); updated += 1
        else:
            ev["added"] = today
            ev = clean(ev)
            data["events"].append(ev); by_id[ev["id"]] = ev; added += 1
    print(f"merged: {added} new, {updated} updated")

def main():
    args = sys.argv[1:]
    today = datetime.date.today().isoformat()
    data = json.loads(DATA.read_text())
    changed = False
    if "--merge" in args:
        merge(data, json.loads(pathlib.Path(args[args.index("--merge") + 1]).read_text()), today)
        changed = True
    trip = data["_meta"]["trip"]
    if "--prune" in args:
        keep = [e for e in data["events"] if e.get("recurring") or (e.get("end_date") or e["date"]) >= trip["start"]]
        print(f"pruned {len(data['events']) - len(keep)} past events")
        data["events"] = keep
        changed = True

    type_ids = {t["id"] for t in data["types"]}
    place_ids = {p["id"] for p in json.loads(PLACES.read_text())["places"]} if PLACES.exists() else set()
    ids = [e.get("id") for e in data["events"]]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        raise SystemExit(f"duplicate ids: {dupes}")
    for ev in data["events"]:
        check(ev, type_ids, place_ids)
    data["events"].sort(key=lambda e: (e.get("date") or "0", e.get("time") or "", e["title"]))

    if changed:
        data["_meta"]["last_updated"] = today
        DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    seed = {"trip": trip, "last_updated": data["_meta"]["last_updated"], "types": data["types"], "events": data["events"]}
    OUT.write_text("// Generated by places/build_events.py from data/events.json. Do not edit.\n"
                   "window.WALKABOUT_EVENTS = " + json.dumps(seed, ensure_ascii=False, separators=(",", ":")) + ";\n")
    by_type = {t: sum(e["type"] == t for e in data["events"]) for t in sorted(type_ids)}
    print(f"built {len(data['events'])} events -> places/events-data.js  {by_type}")

if __name__ == "__main__":
    main()
