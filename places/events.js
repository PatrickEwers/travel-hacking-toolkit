// Walkabout Events tab: day / week / month calendar + filterable list of events from data/events.json.
// Self-contained: app.html only adds the nav button and loads this file. Data comes from
// events-data.js, which places/build_events.py generates from data/events.json.
(() => {
'use strict';
const BASE = (document.currentScript && document.currentScript.src.replace(/[^/]*$/, '')) || '';
const TOTAL_GOALS = 6;
const UI_KEY = 'walkabout.events.ui.v1';
const MODES = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['list', 'List']];
const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WD_LABEL = { sun:'Sun', mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat' };
const NTH = { 1:'1st', 2:'2nd', 3:'3rd', 4:'4th', '-1':'Last' };
const PARTS = [['Morning', '00:00'], ['Afternoon', '12:00'], ['Evening', '17:00'], ['Late night', '22:00']];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';

// ---------- dates: plain YYYY-MM-DD strings, Bangkok local ----------
const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const S = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return S(d); };
const addMonths = (s, n) => { const d = D(s.slice(0, 7) + '-01'); d.setUTCMonth(d.getUTCMonth() + n); return S(d); };
const monday = s => addDays(s, -((D(s).getUTCDay() + 6) % 7));
const fmt = (s, o) => D(s).toLocaleDateString('en-US', { timeZone:'UTC', ...o });
const fmtShort = s => fmt(s, { month:'short', day:'numeric' });
const fmtLong = s => fmt(s, { weekday:'long', month:'short', day:'numeric' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Bangkok' }).format(new Date());

// ---------- state ----------
let DATA = { types:[], events:[], trip:null };
let ui = { mode:'week', types:[], sort:'date', kind:'all' };
try { ui = { ...ui, ...JSON.parse(localStorage.getItem(UI_KEY) || '{}') }; } catch (e) {}
if (!MODES.some(m => m[0] === ui.mode)) ui.mode = 'month';
const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) {} };
let cur = null, pane = null, sheet = null; // cur = the selected day; week and month views show the period around it

const type = id => DATA.types.find(t => t.id === id) || { id, label:id, color:'#868e96', icon:'📅' };
const score = ev => new Set(ev.goals || []).size;
const trip = () => DATA.trip || { start:'0000-01-01', end:'9999-12-31' };
const inTrip = d => d >= trip().start && d <= trip().end;
// First day worth showing: today while the trip is on, otherwise the first trip day.
function startDay() { const t = today(); return inTrip(t) ? t : trip().start; }

function occursOn(ev, day) {
  const r = ev.recurring;
  if (!r) return day >= ev.date && day <= (ev.end_date || ev.date);
  if (day < (r.from || trip().start) || day > (r.until || trip().end)) return false;
  if ((r.except || []).includes(day)) return false;
  const d = D(day), wd = WD[d.getUTCDay()];
  if (r.freq === 'daily') return true;
  if (r.freq === 'weekly') return (r.weekdays || []).includes(wd);
  if (r.freq === 'monthly') {
    if (wd !== r.weekday) return false;
    if (r.nth === -1) return addDays(day, 7).slice(0, 7) !== day.slice(0, 7);
    return Math.ceil(d.getUTCDate() / 7) === r.nth;
  }
  return false;
}
const shown = ev => (!ui.types.length || ui.types.includes(ev.type)) &&
  (ui.kind === 'all' || (ui.kind === 'recurring') === !!ev.recurring);
const multiDay = ev => !ev.recurring && ev.end_date && ev.end_date !== ev.date;
const allDay = ev => !ev.time || (multiDay(ev) && D(ev.end_date) - D(ev.date) > 4 * 864e5); // long runs (exhibitions) sit with the all-day items
const byTime = (a, b) => (allDay(a) ? '' : a.time).localeCompare(allDay(b) ? '' : b.time) || score(b) - score(a) || a.title.localeCompare(b.title);
const eventsOn = day => DATA.events.filter(ev => shown(ev) && occursOn(ev, day)).sort(byTime);
function nextOccurrences(ev, from, n) {
  const out = [], end = trip().end < from ? addDays(from, 60) : trip().end;
  if (!ev.recurring) return (ev.end_date || ev.date) >= from ? [ev.date < from ? from : ev.date] : [];
  for (let d = from; d <= end && out.length < n; d = addDays(d, 1)) if (occursOn(ev, d)) out.push(d);
  return out;
}
function whenLabel(ev) {
  const r = ev.recurring;
  if (r) {
    if (r.freq === 'daily') return 'Daily';
    if (r.freq === 'weekly') return 'Every ' + (r.weekdays || []).map(w => WD_LABEL[w]).join(', ');
    return `${NTH[r.nth] || ''} ${WD_LABEL[r.weekday]} of the month`;
  }
  return multiDay(ev) ? `${fmtShort(ev.date)} – ${fmtShort(ev.end_date)}` : fmtShort(ev.date);
}
const timeLabel = ev => ev.time ? ev.time + (ev.end_time ? '–' + ev.end_time : '') : '';

// ---------- rendering ----------
function pips(ev) {
  const g = new Set(ev.goals || []);
  return DATA.types.map(t => `<i ${g.has(t.id) ? `style="background:${t.color}"` : ''}></i>`).join('');
}
// One event card. Recurring and one-off events carry a different tag so the two are easy to tell apart.
function row(ev, day, withDate) {
  const t = type(ev.type);
  const tag = ev.recurring ? `<span class="ev-tag rec">↻ ${esc(whenLabel(ev))}</span>`
    : `<span class="ev-tag one">One-off${multiDay(ev) ? ' · ' + esc(whenLabel(ev)) : withDate ? ' · ' + esc(fmt(ev.date, { weekday:'short', month:'short', day:'numeric' })) : ''}</span>`;
  return `<div class="ev-item" style="--c:${t.color}" data-ev="${esc(ev.id)}" data-day="${day || ''}">
    <div class="t">${allDay(ev) ? `<b>${ev.time ? ev.time : multiDay(ev) ? 'All day' : 'Time'}</b>${ev.time ? '' : multiDay(ev) ? '' : '<span>TBC</span>'}` : `<b>${ev.time}</b>${ev.end_time ? `<span>${ev.end_time}</span>` : ''}`}</div>
    <div class="body"><div class="name">${esc(ev.title)}</div>
      <div class="meta">${t.icon} ${esc([ev.venue || ev.area, ev.venue && ev.area].filter(Boolean).join(' · ') || t.label)}</div>
      <div class="ev-tags">${tag}${ev.confidence !== 'confirmed' ? '<span class="ev-tag">Check date</span>' : ''}</div></div>
    <div class="ev-score" title="Serves ${score(ev)} of your ${TOTAL_GOALS} goals"><b>${score(ev)}<small>/${TOTAL_GOALS}</small></b><div class="ev-pips">${pips(ev)}</div></div>
  </div>`;
}
function chips() {
  const counts = {}; DATA.events.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
  return `<div class="chip kind ${ui.kind === 'oneoff' ? 'on' : ''}" data-kind="oneoff">One-off</div>
    <div class="chip kind ${ui.kind === 'recurring' ? 'on' : ''}" data-kind="recurring">↻ Recurring</div><span class="ev-div"></span>
    <div class="chip ${ui.types.length ? '' : 'on'}" data-type="">All types</div>` + DATA.types.map(t =>
    `<div class="chip ${ui.types.includes(t.id) ? 'on' : ''}" data-type="${t.id}"><span class="dot" style="background:${t.color}"></span>${esc(t.label)} <span style="opacity:.6">${counts[t.id] || 0}</span></div>`).join('');
}
// Dots for a day: solid = a one-off event of that type, hollow = only recurring ones.
function dots(evs) {
  const m = new Map();
  evs.forEach(e => m.set(e.type, m.get(e.type) || !e.recurring));
  return [...m].map(([t, solid]) => `<i style="${solid ? 'background:' : 'box-shadow:inset 0 0 0 1.5px '}${type(t).color}"></i>`).join('');
}
function nav(title, sub) {
  return `<div class="ev-nav"><button data-step="-1" aria-label="Previous">‹</button>
    <div class="ev-navt"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
    <button class="ev-today" data-today>Today</button><button data-step="1" aria-label="Next">›</button></div>`;
}
const count = (n, w = 'event') => `${n} ${w}${n === 1 ? '' : 's'}`;
const empty = d => `<div class="ev-empty">${inTrip(d) ? 'Nothing saved for this day.' : 'Outside your trip dates.'}</div>`;

function dayView() {
  const evs = eventsOn(cur), timed = evs.filter(e => !allDay(e)), whole = evs.filter(allDay);
  const one = evs.filter(e => !e.recurring).length;
  let body = whole.length ? `<div class="ev-part">All day &amp; ongoing</div>` + whole.map(e => row(e, cur)).join('') : '';
  PARTS.forEach(([label, from], i) => {
    const to = PARTS[i + 1] ? PARTS[i + 1][1] : '99', part = timed.filter(e => e.time >= from && e.time < to);
    if (part.length) body += `<div class="ev-part">${label}</div>` + part.map(e => row(e, cur)).join('');
  });
  return nav(fmt(cur, { weekday:'long', month:'long', day:'numeric' }), evs.length ? `${count(one, 'one-off')} · ${evs.length - one} recurring` : '')
    + strip(monday(cur)) + (body || empty(cur));
}
function strip(mon) {
  const now = today();
  return `<div class="ev-strip">${[0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(mon, i);
    return `<button class="ev-sday ${inTrip(d) ? 'trip' : ''} ${d === now ? 'today' : ''} ${d === cur ? 'sel' : ''}" data-day="${d}" aria-label="${fmtLong(d)}">
      <small>${fmt(d, { weekday:'short' })}</small><span class="n">${+d.slice(8)}</span><span class="ev-dots">${dots(eventsOn(d))}</span></button>`;
  }).join('')}</div>`;
}
function weekView() {
  const mon = monday(cur), sun = addDays(mon, 6);
  let body = '', total = 0;
  for (let d = mon; d <= sun; d = addDays(d, 1)) {
    const evs = eventsOn(d); total += evs.length;
    if (!evs.length && !inTrip(d)) continue;
    body += `<div class="ev-dayhead sticky" data-anchor="${d}"><b>${fmt(d, { weekday:'long' })}</b> ${fmtShort(d)}<span>${evs.length || ''}</span></div>`
      + (evs.map(e => row(e, d)).join('') || '<div class="ev-none">Nothing saved</div>');
  }
  const title = mon.slice(0, 7) === sun.slice(0, 7) ? `${fmtShort(mon)} – ${+sun.slice(8)}` : `${fmtShort(mon)} – ${fmtShort(sun)}`;
  return nav(title, count(total)) + strip(mon) + (body || empty(mon));
}
function monthView() {
  const month = cur.slice(0, 7), first = month + '-01', lead = (D(first).getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate(), now = today();
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<button class="ev-day out" disabled></button>';
  for (let n = 1; n <= days; n++) {
    const day = month + '-' + String(n).padStart(2, '0'), evs = eventsOn(day), one = evs.filter(e => !e.recurring).length;
    cells += `<button class="ev-day ${inTrip(day) ? 'trip' : ''} ${day === now ? 'today' : ''} ${day === cur ? 'sel' : ''}" data-day="${day}" aria-label="${fmtLong(day)}, ${evs.length} events">
      <span class="n">${n}</span><span class="ev-dots">${dots(evs)}</span>${one ? `<span class="ev-cnt">${one}</span>` : ''}</button>`;
  }
  const evs = eventsOn(cur).sort((a, b) => !!a.recurring - !!b.recurring || byTime(a, b)); // one-offs first
  return nav(fmt(first, { month:'long', year:'numeric' }))
    + `<div class="ev-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="ev-wd">${d}</div>`).join('')}${cells}</div>
    <div class="ev-legend"><i style="background:var(--muted)"></i> one-off <i style="box-shadow:inset 0 0 0 1.5px var(--muted)"></i> recurring only · number = one-off events</div>
    <div class="ev-dayhead"><b>${fmt(cur, { weekday:'long' })}</b> ${fmtShort(cur)}<span>${evs.length || ''}</span></div>
    ${evs.map(e => row(e, cur)).join('') || empty(cur)}`;
}
function listView() {
  const from = startDay(), tr = trip(), pool = DATA.events.filter(shown);
  let body = '';
  if (ui.sort === 'score') {
    const rows = pool.map(e => ({ e, next: nextOccurrences(e, from, 1)[0] })).filter(x => x.next)
      .sort((a, b) => score(b.e) - score(a.e) || a.next.localeCompare(b.next) || byTime(a.e, b.e));
    body = rows.map(x => row(x.e, x.next, true)).join('');
  } else {
    const last = pool.reduce((m, e) => e.recurring ? m : (e.end_date || e.date) > m ? (e.end_date || e.date) : m, tr.end);
    for (let d = from; d <= last; d = addDays(d, 1)) {
      // Multi-day events are listed once, on their first visible day.
      const evs = pool.filter(e => occursOn(e, d) && (e.recurring || d === e.date || (d === from && e.date < from))).sort(byTime);
      if (evs.length) body += `<div class="ev-dayhead sticky"><b>${fmt(d, { weekday:'long' })}</b> ${fmtShort(d)}<span>${evs.length}</span></div>` + evs.map(e => row(e, d)).join('');
    }
  }
  return `<div class="ev-tools"><select id="ev-sort" aria-label="Sort"><option value="date">By date</option><option value="score">Best match first</option></select></div>
    ${body || '<div class="ev-empty">No events match. Clear the filters, or run the events routine to find more.</div>'}`;
}
function render(keepScroll) {
  if (!pane) return;
  const tr = DATA.trip, body = pane.querySelector('.ev-body'), top = body.scrollTop;
  pane.querySelector('.ev-sub').textContent = tr ? `${tr.city || ''} · ${fmtShort(tr.start)} – ${fmtShort(tr.end)}` : '';
  pane.querySelectorAll('.ev-seg.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === ui.mode));
  pane.querySelector('.chips').innerHTML = chips();
  body.innerHTML = !DATA.events.length ? '<div class="ev-empty">No events yet. Run the events routine (places/EVENTS.md) to search for some.</div>'
    : { day: dayView, week: weekView, month: monthView, list: listView }[ui.mode]();
  body.scrollTop = keepScroll ? top : 0;
  const sort = body.querySelector('#ev-sort');
  if (sort) { sort.value = ui.sort; sort.onchange = () => { ui.sort = sort.value; saveUi(); render(); }; }
}

function showEvent(id, day) {
  const ev = DATA.events.find(e => e.id === id); if (!ev) return;
  const t = type(ev.type), g = new Set(ev.goals || []);
  const next = nextOccurrences(ev, startDay(), 4);
  day = day || next[0] || ev.date;
  const where = [ev.venue, ev.area].filter(Boolean).join(' · ');
  const q = ev.gmaps_query || [ev.venue, ev.address || ev.area, 'Bangkok'].filter(Boolean).join(', ');
  const maps = ev.venue || ev.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
  const hasPlace = ev.place_id && typeof window.showPlace === 'function';
  sheet.innerHTML = `<button class="x" aria-label="Close">✕</button>
    <div class="meta">${t.icon} ${esc(t.label)} · ${ev.recurring ? '↻ Recurring' : 'One-off event'}</div>
    <h2>${esc(ev.title)}</h2>
    <div class="ev-goals">${DATA.types.map(x => `<span class="ev-goal ${g.has(x.id) ? 'yes' : ''}" ${g.has(x.id) ? `style="background:${x.color}"` : ''}>${g.has(x.id) ? '✓' : '·'} ${esc(x.label)}</span>`).join('')}</div>
    <div class="meta" style="margin-top:6px">Serves ${score(ev)} of your ${TOTAL_GOALS} goals</div>
    <dl class="ev-facts">
      <dt>When</dt><dd>${esc(whenLabel(ev))}${timeLabel(ev) ? ', ' + esc(timeLabel(ev)) : ''}${ev.recurring && next.length ? `<div class="meta">Next: ${next.map(fmtShort).join(', ')}</div>` : ''}</dd>
      ${where ? `<dt>Where</dt><dd>${esc(where)}${ev.address ? `<div class="meta">${esc(ev.address)}</div>` : ''}</dd>` : ''}
      ${ev.price ? `<dt>Price</dt><dd>${esc(ev.price)}</dd>` : ''}
      ${ev.organizer ? `<dt>Host</dt><dd>${esc(ev.organizer)}</dd>` : ''}
    </dl>
    ${ev.notes ? `<p>${esc(ev.notes)}</p>` : ''}
    ${ev.confidence !== 'confirmed' ? '<div class="ev-warn">Recurring or expected event: this exact date was not seen listed. Check the event page before going.</div>' : ''}
    <div class="row">
      ${safeUrl(ev.url) ? `<a href="${esc(safeUrl(ev.url))}" target="_blank" rel="noopener"><button class="primary">Event page</button></a>` : ''}
      ${hasPlace ? '<button id="ev-place">Show on map</button>' : ''}
      ${maps ? `<a href="${esc(maps)}" target="_blank" rel="noopener"><button>Google Maps</button></a>` : ''}
      ${day ? `<a href="${esc(gcal(ev, day))}" target="_blank" rel="noopener"><button>Add to calendar</button></a>` : ''}
    </div>
    <div class="meta" style="margin-top:10px">Checked ${esc(ev.verified || ev.added || '')}</div>`;
  sheet.classList.add('show'); sheet.scrollTop = 0;
  sheet.querySelector('.x').onclick = closeSheet;
  const pl = sheet.querySelector('#ev-place');
  if (pl) pl.onclick = () => { window.setView('map'); window.showPlace(ev.place_id); };
}
function closeSheet() { if (sheet) sheet.classList.remove('show'); }
function gcal(ev, day) {
  const c = s => s.replace(/[-:]/g, '');
  let dates;
  if (ev.time) {
    const end = ev.end_time || String((+ev.time.slice(0, 2) + 2) % 24).padStart(2, '0') + ev.time.slice(2);
    dates = `${c(day)}T${c(ev.time)}00/${c(end <= ev.time ? addDays(day, 1) : day)}T${c(end)}00`;
  } else dates = `${c(day)}/${c(addDays(ev.recurring ? day : (ev.end_date || day), 1))}`;
  const p = new URLSearchParams({ action:'TEMPLATE', text:ev.title, dates, ctz:'Asia/Bangkok',
    location:[ev.venue, ev.address || ev.area].filter(Boolean).join(', '), details:[ev.notes, ev.url].filter(Boolean).join('\n\n') });
  return 'https://calendar.google.com/calendar/render?' + p;
}

// ---------- wiring ----------
function mount() {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = BASE + 'events.css'; document.head.appendChild(css);
  pane = document.createElement('div'); pane.id = 'events';
  pane.innerHTML = `<div class="ev-head"><div class="ev-title">Events<span class="ev-sub"></span></div>
</div>
    <div class="ev-seg modes">${MODES.map(([m, l]) => `<button data-mode="${m}">${l}</button>`).join('')}</div>
    <div class="chips"></div><div class="ev-body"></div>`;
  sheet = document.createElement('div'); sheet.className = 'sheet'; sheet.id = 'ev-sheet';
  document.body.append(pane, sheet);

  pane.addEventListener('click', e => {
    const q = s => e.target.closest(s);
    const mode = q('[data-mode]'), kind = q('[data-kind]'), chip = q('.chip'), item = q('.ev-item'), dayBtn = q('button[data-day]'), step = q('[data-step]');
    if (mode) { ui.mode = mode.dataset.mode; saveUi(); closeSheet(); render(); }
    else if (kind) { ui.kind = ui.kind === kind.dataset.kind ? 'all' : kind.dataset.kind; saveUi(); render(true); }
    else if (chip) {
      const t = chip.dataset.type;
      ui.types = !t ? [] : ui.types.includes(t) ? ui.types.filter(x => x !== t) : ui.types.concat(t);
      saveUi(); render(true);
    }
    else if (item) showEvent(item.dataset.ev, item.dataset.day);
    else if (q('[data-today]')) { cur = startDay(); closeSheet(); render(); }
    else if (dayBtn) {
      cur = dayBtn.dataset.day; closeSheet(); render(true);
      // In the week view the strip jumps to that day's section.
      const a = ui.mode === 'week' && pane.querySelector(`[data-anchor="${cur}"]`), body = pane.querySelector('.ev-body');
      if (a) body.scrollTop = a.offsetTop - body.offsetTop;
    }
    else if (step) {
      const n = +step.dataset.step;
      cur = ui.mode === 'month' ? addMonths(cur, n) : addDays(cur, ui.mode === 'week' ? 7 * n : n);
      if (ui.mode === 'month' && inTrip(startDay()) && cur.slice(0, 7) === startDay().slice(0, 7)) cur = startDay();
      closeSheet(); render();
    }
  });

  // The app's setView() already handles the nav highlight; add the Events pane on top of it.
  const appSetView = window.setView;
  window.setView = v => {
    appSetView(v);
    const on = v === 'events';
    pane.classList.toggle('show', on); document.body.classList.toggle('ev-on', on);
    closeSheet();
    if (on) render();
  };
  if (decodeURIComponent(location.hash.slice(1)) === 'events') window.setView('events');
}
function start(data) {
  DATA = { types: data.types || [], events: data.events || [], trip: data.trip || null };
  ui.types = ui.types.filter(t => DATA.types.some(x => x.id === t));
  cur = startDay();
  render();
}

mount();
const s = document.createElement('script');
s.src = BASE + 'events-data.js';
s.onload = () => start(window.WALKABOUT_EVENTS || {});
s.onerror = () => { pane.querySelector('.ev-body').innerHTML = '<div class="ev-empty">Could not load events-data.js. Run python3 places/build_events.py.</div>'; };
document.head.appendChild(s);
})();
