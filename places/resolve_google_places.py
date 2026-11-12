#!/usr/bin/env python3
"""Give every place in data/places.json exact coordinates from the Google Places API (New).

Places with a Google Maps URL are matched by the place's CID, so the hit is the same listing, not a
look-alike. Others take the top text-search result. Skips places that already have google_place_id.
Auth: send X-Goog-Api-Key yourself, or run in a cloud session whose environment has a network secret
for places.googleapis.com (header X-Goog-Api-Key, no prefix). Then run places/build.py.
"""
import json, re, subprocess, pathlib, time, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
data = json.loads((ROOT/'data/places.json').read_text())
orig = {}
FM = 'places.id,places.displayName,places.location,places.formattedAddress,places.googleMapsUri,places.primaryType,places.types'
def search(q, lat=None, lng=None):
    body = {'textQuery': q, 'languageCode': 'en'}
    if lat is not None: body['locationBias'] = {'circle': {'center': {'latitude': lat, 'longitude': lng}, 'radius': 30000}}
    r = subprocess.run(['curl','-sS','-m','25','-X','POST','https://places.googleapis.com/v1/places:searchText','-H','Content-Type: application/json',
        '-H','X-Goog-FieldMask: '+FM,'-d',json.dumps(body)], capture_output=True, text=True)
    try: return json.loads(r.stdout).get('places', [])
    except Exception: return []
log = []
for p in data['places']:
    if p.get('google_place_id'): continue  # already exact
    url = p.get('google_maps_url',''); m = re.search(r'1s0x[0-9a-f]+:(0x[0-9a-f]+)', url)
    cid = str(int(m.group(1),16)) if m else None
    q = orig.get(url) or p.get('gmaps_query') or p['name']
    if not m and 'search/' in url: log.append((p['name'],'kept (dropped pin, already exact)')); continue
    hit = None; how = ''
    for args in ((q, p['lat'], p['lng']), (q,), (f"{q} {p.get('city','')}".strip(),)):
        res = search(*args)
        if cid:
            hit = next((x for x in res if re.search(r'cid='+cid+r'(\D|$)', x.get('googleMapsUri',''))), None); how = 'cid'
        elif res: hit = res[0]; how = 'top'
        if hit: break
        time.sleep(0.1)
    if not hit: log.append((p['name'],'UNRESOLVED')); continue
    loc = hit['location']
    import math
    d = 6371000*2*math.asin(math.sqrt(math.sin(math.radians(loc['latitude']-p['lat'])/2)**2+math.cos(math.radians(p['lat']))*math.cos(math.radians(loc['latitude']))*math.sin(math.radians(loc['longitude']-p['lng'])/2)**2))
    p['lat'], p['lng'] = round(loc['latitude'],6), round(loc['longitude'],6); p['coords_precision'] = 'exact'
    p['google_place_id'] = hit['id']; p['google_type'] = hit.get('primaryType') or (hit.get('types') or [''])[0]
    if hit.get('formattedAddress') and not p.get('address'): p['address'] = hit['formattedAddress']
    if how == 'top': p['google_maps_url'] = hit.get('googleMapsUri', '')
    log.append((p['name'], f"{how} moved {d:.0f} m | {p['google_type']} | {hit['displayName']['text']}"))
(ROOT/'data/places.json').write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n')
for n,l in log: print(n[:38].ljust(38), l)
