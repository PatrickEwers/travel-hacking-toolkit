// Walkabout Events tab: month calendar + filterable list of events from data/events.json.
// Self-contained: app.html only adds the nav button and loads this file. Data comes from
// events-data.js, which places/build_events.py generates from data/events.json.
(() => {
'use strict';
const BASE = (document.currentScript && document.currentScript.src.replace(/[^/]*$/, '')) || '';
const TOTAL_GOALS = 6;
const UI_KEY = 'walkabout.events.ui.v1';
const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WD_LABEL = { sun:'Sun', mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat' };
const NTH = { 1:'1st', 2:'2nd', 3:'3rd', 4:'4th', '-1':'Last' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';

// ---------- dates: plain YYYY-MM-DD strings, Bangkok local ----------
const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const S = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return S(d); };
const fmt = (s, o) => D(s).toLocaleDateString('en-US', { timeZone:'UTC', ...o });
const fmtShort = s => fmt(s, { month:'short', day:'numeric' });
const fmtLong = s => fmt(s, { weekday:'long', month:'short', day:'numeric' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Bangkok' }).format(new Date());

// ---------- state ----------
let DATA = { types:[], events:[], trip:null };
let ui = { mode:'cal', types:[], sort:'date', recurring:true };
try { ui = { ...ui, ...JSON.parse(localStorage.getItem(UI_KEY) || '{}') }; } catch (e) {}
const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) {} };
let month = null, selDay = null, pane = null, sheet = null;

const type = id => DATA.types.find(t => t.id === id) || { id, label:id, color:'#868e96', icon:'📅' };
const score = ev => new Set(ev.goals || []).size;
const trip = () => DATA.trip || { start:'0000-01-01', end:'9999-12-31' };
// First day worth showing: today while the trip is on, otherwise the first trip day.
function startDay() { const t = today(), tr = trip(); return t >= tr.start && t <= tr.end ? t : tr.start; }

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
const shown = ev => (!ui.types.length || ui.types.includes(ev.type));
const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || score(b) - score(a) || a.title.localeCompare(b.title);
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
  return ev.end_date && ev.end_date !== ev.date ? `${fmtShort(ev.date)} – ${fmtShort(ev.end_date)}` : fmtShort(ev.date);
}
const timeLabel = ev => ev.time ? ev.time + (ev.end_time ? '–' + ev.end_time : '') : '';

// ---------- rendering ----------
function pips(ev) {
  const g = new Set(ev.goals || []);
  return DATA.types.map(t => `<i ${g.has(t.id) ? `style="background:${t.color}"` : ''}></i>`).join('');
}
function row(ev, day, showWhen) {
  const t = type(ev.type);
  const meta = [showWhen ? whenLabel(ev) : (ev.recurring ? '↻' : ev.end_date && ev.end_date !== ev.date ? 'until ' + fmtShort(ev.end_date) : ''),
    timeLabel(ev), ev.venue || ev.area].filter(Boolean).join(' · ');
  return `<div class="ev-item" data-ev="${esc(ev.id)}" data-day="${day || ''}">
    <div class="ic" style="background:${t.color}22">${t.icon}</div>
    <div class="body"><div class="name">${esc(ev.title)}</div><div class="meta">${esc(meta)}</div></div>
    <div class="ev-score" title="Serves ${score(ev)} of your ${TOTAL_GOALS} goals"><b>${score(ev)}<small>/${TOTAL_GOALS}</small></b><div class="ev-pips">${pips(ev)}</div></div>
  </div>`;
}
function chips() {
  const counts = {}; DATA.events.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
  return `<div class="chip ${ui.types.length ? '' : 'on'}" data-type="">All</div>` + DATA.types.map(t =>
    `<div class="chip ${ui.types.includes(t.id) ? 'on' : ''}" data-type="${t.id}"><span class="dot" style="background:${t.color}"></span>${esc(t.label)} <span style="opacity:.6">${counts[t.id] || 0}</span></div>`).join('');
}
function calendar() {
  const tr = trip(), first = month + '-01', lead = (D(first).getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate(), now = today();
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<button class="ev-day out" disabled></button>';
  for (let n = 1; n <= days; n++) {
    const day = month + '-' + String(n).padStart(2, '0'), evs = eventsOn(day);
    const types = [...new Set(evs.map(e => e.type))], best = Math.max(0, ...evs.map(score));
    cells += `<button class="ev-day ${day >= tr.start && day <= tr.end ? 'trip' : ''} ${day === now ? 'today' : ''} ${day === selDay ? 'sel' : ''}" data-day="${day}" aria-label="${fmtLong(day)}, ${evs.length} events">
      <span class="n">${n}</span><span class="ev-dots">${types.map(t => `<i style="background:${type(t).color}"></i>`).join('')}</span>
      ${best >= 4 ? `<span class="ev-best">${best}</span>` : ''}</button>`;
  }
  const evs = selDay ? eventsOn(selDay).sort((a, b) => score(b) - score(a) || byTime(a, b)) : []; // best match first
  return `<div class="ev-month"><button data-step="-1" aria-label="Previous month">‹</button><b>${fmt(first, { month:'long', year:'numeric' })}</b><button data-step="1" aria-label="Next month">›</button></div>
    <div class="ev-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="ev-wd">${d}</div>`).join('')}${cells}</div>
    ${selDay ? `<div class="ev-dayhead">${fmtLong(selDay)} · ${evs.length} event${evs.length === 1 ? '' : 's'}</div>
      ${evs.map(e => row(e, selDay)).join('') || '<div class="ev-empty">Nothing saved for this day.</div>'}` : ''}`;
}
function list() {
  const from = startDay(), tr = trip();
  const pool = DATA.events.filter(e => shown(e) && (ui.recurring || !e.recurring));
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
      if (evs.length) body += `<div class="ev-dayhead sticky">${fmtLong(d)}</div>` + evs.map(e => row(e, d)).join('');
    }
  }
  return `<div class="ev-tools"><select id="ev-sort" aria-label="Sort"><option value="date">By date</option><option value="score">Best match first</option></select>
      <label><input type="checkbox" id="ev-rec" ${ui.recurring ? 'checked' : ''}> Weekly meetups</label></div>
    ${body || '<div class="ev-empty">No events match. Clear the filter, or run the events routine to find more.</div>'}`;
}
function render() {
  if (!pane) return;
  const tr = DATA.trip;
  pane.querySelector('.ev-sub').textContent = tr ? `${tr.city || ''} · ${fmtShort(tr.start)} – ${fmtShort(tr.end)}` : '';
  pane.querySelectorAll('.ev-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === ui.mode));
  pane.querySelector('.chips').innerHTML = chips();
  const body = pane.querySelector('.ev-body');
  body.innerHTML = !DATA.events.length ? '<div class="ev-empty">No events yet. Run the events routine (places/EVENTS.md) to search for some.</div>'
    : ui.mode === 'cal' ? calendar() : list();
  const sort = body.querySelector('#ev-sort');
  if (sort) { sort.value = ui.sort; sort.onchange = () => { ui.sort = sort.value; saveUi(); render(); }; }
  const rec = body.querySelector('#ev-rec');
  if (rec) rec.onchange = () => { ui.recurring = rec.checked; saveUi(); render(); };
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
    <div class="meta">${t.icon} ${esc(t.label)}</div>
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
      <div class="ev-seg"><button data-mode="cal">Calendar</button><button data-mode="list">List</button></div></div>
    <div class="chips"></div><div class="ev-body"></div>`;
  sheet = document.createElement('div'); sheet.className = 'sheet'; sheet.id = 'ev-sheet';
  document.body.append(pane, sheet);

  pane.addEventListener('click', e => {
    const seg = e.target.closest('.ev-seg button'), chip = e.target.closest('.chip'), item = e.target.closest('.ev-item'),
      dayBtn = e.target.closest('.ev-day[data-day]'), step = e.target.closest('[data-step]');
    if (seg) { ui.mode = seg.dataset.mode; saveUi(); closeSheet(); render(); pane.querySelector('.ev-body').scrollTop = 0; }
    else if (chip) {
      const t = chip.dataset.type;
      ui.types = !t ? [] : ui.types.includes(t) ? ui.types.filter(x => x !== t) : ui.types.concat(t);
      saveUi(); render();
    }
    else if (item) showEvent(item.dataset.ev, item.dataset.day);
    else if (dayBtn) { selDay = dayBtn.dataset.day; closeSheet(); render(); }
    else if (step) {
      const d = D(month + '-01'); d.setUTCMonth(d.getUTCMonth() + +step.dataset.step); month = S(d).slice(0, 7);
      selDay = selDay && selDay.slice(0, 7) === month ? selDay : null; render();
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
  selDay = startDay(); month = selDay.slice(0, 7);
  render();
}

mount();
const s = document.createElement('script');
s.src = BASE + 'events-data.js';
s.onload = () => start(window.WALKABOUT_EVENTS || {});
s.onerror = () => { pane.querySelector('.ev-body').innerHTML = '<div class="ev-empty">Could not load events-data.js. Run python3 places/build_events.py.</div>'; };
document.head.appendChild(s);
})();
