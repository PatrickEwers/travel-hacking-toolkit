---
name: places
description: Walkabout, the personal places database with a location-aware mobile map. Add a place by just its name ("add TICTACTOE", "I went to X, save it", "log this bar"), auto-identify it via web search, write it to data/places.json, rebuild the Bangkok/world map, and produce Google Maps share links plus KML/CSV for Google My Maps. Use for "my places", "save this spot", "add a place", "places map", "share location", "send someone the Google Maps link".
category: destinations
summary: Saved places database, location-aware map, Google Maps share links, My Maps export.
api_key: None (free)
license: MIT
---

# Places (Walkabout)

Walkabout is the app name. The user's own database of places they've been or want to go. Lives in `data/places.json`.
`places/build.py` turns it into `places/index.html` (a single-file map app), `places/my-places.kml`
and `places/my-places.csv`.

## Add a place from just a name

When the user names a place ("add Tichuca", "I went to the bar on the 5th floor of EmSphere"):

1. **Identify it. Don't ask first.** Web search `"<name>" <city>` (default city: the last one used
   in `data/places.json`, else Bangkok). Use the user's description (mall, floor, "next to the
   supermarket") to break ties. Mis-heard voice input is common: match on sound-alike names
   ("tic-tac-toe" = TICTACTOE).
2. **Get coordinates.** Prefer coordinates from a source page (Wikipedia, official site, Time Out).
   For a venue inside a mall, the mall's coordinates are fine: set `coords_precision: "building"`
   and put the floor in `address`. If you only have an area, use `"approximate"` and say so.
3. **Write the entry** to `data/places.json` → `places[]` following `_meta.schema`. Required:
   `id` (kebab-case, unique), `name`, `lat`, `lng`, `category`. Fill `city`, `country`, `address`,
   `notes` (what makes it worth going, prices, what to order), `hours` (flag conflicts), `sources`,
   `added` (today). Set `gmaps_query` to a short string Google Maps resolves to the real listing
   (e.g. `"TICTACTOE EmSphere Bangkok"`).
4. **Rebuild:** set `_meta.last_updated` to today, then `python3 places/build.py`.
5. **Reply** with a one-row table (name, category, address, coords precision) and the Google Maps
   share link: `https://www.google.com/maps/search/?api=1&query=<url-encoded gmaps_query>`.

## Exact pins (Google Places)

After adding or importing places, run `python3 places/resolve_google_places.py` then
`python3 places/build.py`. It needs the Places API key (network secret for places.googleapis.com,
header `X-Goog-Api-Key`). It sets exact `lat`/`lng`, `google_place_id`, `google_type` (use it to
check your category) and fills a missing `address`. Coordinates decoded from list URLs alone can be
kilometres off: never leave them unresolved when the key is available.

## Categories

`data/places.json → categories[]` is the scheme: `id`, `label`, `color` (map pin color), `icon`
(emoji), `keywords` (used by the app's auto-categorizer). `build.py` rejects unknown category ids.

- **Auto-categorize every new place.** Decide from what the place actually is (your web search),
  not just its name: a "bar" that's really a club is `nightclub`; a bar on a roof is `rooftop-bar`.
  Pick the most specific existing category; use `other` only as a last resort.
- **When the user names a new category** ("this is a jazz bar, make a category for it"), add it
  to `categories[]` before `other`, with a color clearly distinct from the existing ones, a fitting
  emoji and a few keywords. Then re-check existing places that belong in it and move them.
- **When nothing fits and the user didn't name one**, use the closest category and say in one
  line which new category you'd suggest. Don't create categories the user didn't ask for.
- **Stars:** `"starred": true`. Set it when the user says star / favourite / must-go.

## Importing from Google Maps

There is no Google Maps connector and no API for a user's saved places. The route is Google Takeout:
takeout.google.com → Deselect all → tick **Saved** (lists, CSV per list) and **Maps (your places)**
(`Saved Places.json`, `Reviews.json`) → export → in the app: List → Import… → pick the .zip.
The app parses the files, takes coordinates from the GeoJSON or from the Google URL, looks up the
rest by name on OpenStreetMap (1/s, approximate), de-duplicates, auto-categorizes, stars places from
"Saved Places"/"Favourite" lists, and tags each place with the list names. Unlocated places can be
downloaded as CSV: identify those with web search like any add-by-name request.
Deep link: `index.html#import`.

## Merging changes from the app

Run `python3 places/merge_changes.py <my-places-changes.json>`. It does the steps below and rebuilds.

The app saves edits on the device. ☰ List → Export… → "My changes" downloads
`my-places-changes.json` with `new_places`, `edits` (`{id: {category?, starred?}}`) and
`new_categories`. To merge: add new categories first (keep their color), apply edits to matching
ids, append new places (skip ids that already exist), set `_meta.last_updated`, rebuild.

## The app (`places/index.html`)

- Map pins colored by category, starred places get a gold ring. Category chips along the top
  act as legend and filter (tap several; "★ Starred" filters to favourites).
- List view (List button, or `#list` link): grouped by category, or sorted by distance/name,
  with a star toggle per row.
- Place card: star toggle and a category dropdown to fix the auto-category, incl. "＋ New category…".
- ◎ starts location tracking; within 120 m of a saved place it pops a "You are here" card.
- Add bar: type a name (OpenStreetMap search near the map view), paste a Google Maps link, or
  "use my current location". The category is pre-filled automatically (keywords, then the
  OpenStreetMap place type) and can be changed before saving.
- Each place: Open in Google Maps, Directions, Share (native share sheet / copies the link).
- Deep link: `index.html#<place-id>` opens that place.
- Location needs HTTPS or localhost: `python3 -m http.server -d places 8000`, or host it.

## Google Maps sync: what's possible

Google has **no public API to write to a user's Google Maps saved lists or My Maps.** So:

- **Google My Maps (works today):** mymaps.google.com → create map → Import → `places/my-places.kml`.
  Re-import after adding places (delete the old layer first). The My Maps map then shows in the
  Google Maps app under Saved → Maps.
- **Share links (works today):** every place has a Google Maps search link that opens the real
  listing, which the recipient can save themselves.
- **Fully automatic sync** is not possible with Google's APIs. Don't claim otherwise.

## Events tab

Walkabout also has an Events tab (month calendar + list, filterable by type, each event scored by how
many of the owner's six goals it serves). Data lives in `data/events.json`; the code is separate from
the places app (`places/events.js`, `places/events.css`, `places/build_events.py`). To find or refresh
events ("find events in Bangkok", "what's on this week", "update the events"), follow
`places/EVENTS.md`, then `python3 places/build_events.py --merge found.json`.
