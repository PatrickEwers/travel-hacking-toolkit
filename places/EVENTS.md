# Walkabout events routine

Finds events for the trip in `data/events.json → _meta.trip` (currently Bangkok, 2026-11-19 to
2027-01-12) and keeps the Events tab current. Run it weekly while the trip is on; new listings for
meetups and club nights usually appear only 1 to 3 weeks ahead.

## Goals and types

Each type is one of the owner's goals. `type` is the goal an event serves best; `goals[]` lists every
goal it genuinely serves. **Score = number of goals served (1 to 6).** Don't pad: a techno night is
`party`, not `party + travelers + mind`.

| id | Type | Counts when |
|---|---|---|
| `thai` | Speak Thai | you would actually speak Thai there: language exchanges, Thai conversation groups, Thai-run classes |
| `builders` | Meet builders | founders, engineers, creatives; new friends working on interesting things |
| `travelers` | Travelers & expats | the crowd is mostly travelers, nomads, expats |
| `sports` | Sports & active | you move: runs, pickup games, races, classes (watching a fight card counts weakly; say so in notes) |
| `mind` | Mind | talks, workshops, meditation, exhibitions, anything you leave smarter from |
| `party` | Party | nightlife, festivals, club nights, pool and boat parties |

## Steps

1. **Read** `data/events.json`: trip dates, existing events, `verified` dates.
2. **Search** each type for the window from today (or trip start) to trip end. Run the six searches in
   parallel. Sources that work for Bangkok:
   - meetups: meetup.com, luma.com/bangkok, eventbrite.com, createwith.com/cities/bangkok, allai.events
   - tickets and nightlife: ra.co, ticketmelon.com, eventpop.me, megatix.in.th, technoairlines.com, siam2nite.com
   - editorial: Time Out Bangkok, BK Magazine, Bangkok Post, nationthailand.com
   - talks and culture: thesiamsociety.org, neilsonhayslibrary.org, fccthai.com, bacc.or.th, mocabangkok.com
   - sport: Bangkok Runners / Lumpini Running Club on Meetup, reclub.co, thai.run, rajadamnern.com
   Fetch pages with curl (the environment allows these hosts). Still closed to this container:
   ra.co and bacc.or.th (site-level 403), Facebook (login). Facebook events need Claude in Chrome
   in a session on the owner's computer; merge its JSON output the same way.
3. **Never invent.** Every event needs a `url` you saw it on. Unknown time, price or venue stays null.
   `confidence: "confirmed"` only when a listing for that exact date was seen; recurring meetups whose
   in-window dates aren't listed yet are `"likely"`. Sold-out or registration-closed events: leave out,
   or keep with the caveat first in `notes` if spectating is worthwhile.
4. **Recurring** meetups go in once with `recurring` (weekly / monthly nth weekday / daily, optional
   `from`, `until`, `except`), not once per date.
5. **Link saved places.** If the venue is in `data/places.json`, set `place_id` (adds "Show on map").
6. **Re-verify** existing one-off events in the next 14 days and recurring ones whose `verified` is
   older than 14 days: fix changed dates, delete cancelled ones.
7. **Merge and build.** Write the found events as a JSON array (schema in `_meta.schema`, `id` optional)
   and run `python3 places/build_events.py --merge found.json`. Same id = update in place. Add
   `--prune` to drop one-offs that ended before the trip. The script validates and regenerates
   `places/events-data.js`.
8. **Report** a table of what's new, sorted by score, and the three best picks for the coming week.
   Commit data only (`data/events.json`, `places/events-data.js`). Do not deploy.

## Files

- `data/events.json` source of truth (trip, types, events)
- `places/build_events.py` validate, merge, build
- `places/events-data.js` generated; loaded by the app
- `places/events.js`, `places/events.css` the Events tab (calendar, list, type filter, detail sheet)
- `places/app.html` only carries the nav button and the `events.js` script tag

Deep link: `index.html#events`.
