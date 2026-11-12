#!/usr/bin/env python3
"""Decode Google Maps saved-list CSVs (Takeout "Saved/*.csv") into name/note/url/lat/lng JSON.

The list CSVs carry no coordinates, but each URL holds a place id "1s0x<A>:0x<B>" whose first half is an
S2 cell id near the place. Decoding it gives a pin that is usually within ~200 m, occasionally km off.
Usage: pip install s2sphere; python3 places/decode_google_lists.py list1.csv list2.csv  (writes decoded.json next to this script)
"""
import csv, io, re, sys, json, urllib.parse
import s2sphere
def rows(path):
    t = open(path, encoding='utf-8-sig').read()
    i = t.index('Title,Note,URL')
    for r in csv.DictReader(io.StringIO(t[i:])):
        if (r.get('URL') or '').strip(): yield r
out = {}
for path in sys.argv[1:]:
    lst = re.sub(r'^[0-9a-f]+-', '', path.split('/')[-1]).replace('.csv','').replace('_',' ')
    for r in rows(path):
        url = r['URL'].replace('\n','')
        m = re.search(r'1s(0x[0-9a-f]+):(0x[0-9a-f]+)', url); c = re.search(r'search/(-?[\d.]+),(-?[\d.]+)', url)
        if m:
            ll = s2sphere.CellId(int(m.group(1),16)).to_lat_lng(); lat, lng = ll.lat().degrees, ll.lng().degrees
        elif c: lat, lng = float(c.group(1)), float(c.group(2))
        else: continue
        e = out.setdefault(url, dict(name=' '.join((r['Title'] or '').split()), note=(r['Note'] or '').strip(), url=url, lat=round(lat,6), lng=round(lng,6), lists=[]))
        if lst not in e['lists']: e['lists'].append(lst)
        if not e['note']: e['note'] = (r['Note'] or '').strip()
json.dump(list(out.values()), open(sys.argv[0].replace('decode.py','decoded.json'),'w'), ensure_ascii=False, indent=1)
for e in out.values(): print(f"{e['lat']:.5f},{e['lng']:.5f} | {e['name'][:45]} | {';'.join(e['lists'])}")
