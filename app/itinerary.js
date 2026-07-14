/* app/itinerary.js — 行程 tab：日期 chips、卡片時間軸、景點庫搜尋、拖移排序 */
import { SPOTS } from './spots-data.js';

const CAT_EMOJI = { '海灘':'🏖️','觀景':'🌅','寺廟':'⛩️','咖啡':'☕','市場':'🛒','拍照':'📸','自然':'🌿','夜景':'🌃','美食':'🍜','購物':'🛍️','體驗':'🎡','親子':'🧸','歷史':'🏛️' };

/* ---------- 純函式（排序邏輯，見 tests/itinerary.test.mjs） ---------- */
export function dayRange(start, end) {
  const s = new Date(start + 'T00:00:00Z'), e = new Date(end + 'T00:00:00Z');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];
  // 拒絕月曆上不存在的日期（如 2/30 會被 JS 滾成 3/2）
  if (s.toISOString().slice(0, 10) !== start || e.toISOString().slice(0, 10) !== end) return [];
  const out = [];
  for (let t = s.getTime(); t <= e.getTime() && out.length < 60; t += 86400000) { // 超過 60 天截斷（防呆，非錯誤）
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function sortedDayItems(records, day) {
  return Object.values(records)
    .filter(r => Number(r.deleted) !== 1 && r.day === day)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || Number(a.updatedAt) - Number(b.updatedAt));
}

export function midpoint(prev, next) {
  if (prev == null && next == null) return 1;
  if (prev == null) return Number(next) - 1;
  if (next == null) return Number(prev) + 1;
  return (Number(prev) + Number(next)) / 2;
}

export function insertOrderForTime(items, time) {
  if (time) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].time && items[i].time > time) {
        return midpoint(i > 0 ? items[i - 1].sortOrder : null, items[i].sortOrder);
      }
    }
  }
  return items.length ? Number(items[items.length - 1].sortOrder) + 1 : 1;
}

export function needsRenorm(items) {
  for (let i = 1; i < items.length; i++) {
    if (Math.abs(Number(items[i].sortOrder) - Number(items[i - 1].sortOrder)) < 1e-6) return true;
  }
  return false;
}

export function renormalize(items) {
  return items.map((r, i) => ({ ...r, sortOrder: i + 1 }));
}

export function kakaoMapUrl(name, lat, lng) {
  return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
}

/* ---------- UI ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WEEK = ['日','一','二','三','四','五','六'];

let currentDay = null;
let expandedId = null;
export let dragState = { dragging: false, pending: null }; // Task 4 拖移時守門

function trip(engine) {
  const g = k => { const r = engine.data.settings[k]; return r && r.value; };
  return { start: g('tripStart') || '2026-10-22', end: g('tripEnd') || '2026-10-29' };
}

function localToday() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function renderItinerary(el, engine) {
  if (dragState.dragging) { dragState.pending = { el, engine }; return; } // 拖移中不重繪
  const { start, end } = trip(engine);
  const days = dayRange(start, end);
  if (!days.length) { el.innerHTML = '<div class="placeholder"><span class="e">📅</span>settings 的 tripStart / tripEnd 不正確</div>'; return; }
  if (!currentDay || !days.includes(currentDay)) {
    const today = localToday();
    currentDay = days.includes(today) ? today : days[0];
  }
  const items = sortedDayItems(engine.data.itinerary, currentDay);

  // 保留打到一半的新增表單（背景輪詢重繪時）
  let saved = null;
  if (el.querySelector('#it-form')) {
    const active = document.activeElement;
    saved = {
      time: el.querySelector('#it-time').value,
      title: el.querySelector('#it-title').value,
      note: el.querySelector('#it-note').value,
      spotId: el.querySelector('#it-form').dataset.spotId || '',
      focusId: active && el.contains(active) ? active.id : null,
    };
  }

  const chips = days.map(d => {
    const [, m, dd] = d.split('-');
    const w = WEEK[new Date(d + 'T00:00:00').getDay()];
    return `<button type="button" class="daychip${d === currentDay ? ' on' : ''}${d === localToday() ? ' today' : ''}" data-day="${d}">${Number(m)}/${Number(dd)}<small>週${w}</small></button>`;
  }).join('');

  const cards = items.map(r => {
    const spot = r.spotId ? SPOTS.find(s => s.id === r.spotId) : null;
    const emoji = spot ? (CAT_EMOJI[spot.cat] || '📍') : '📝';
    const open = expandedId === r.id;
    return `
    <div class="itcard${Number(r.done) === 1 ? ' done' : ''}${open ? ' open' : ''}" data-id="${esc(r.id)}" style="--dc:${spot ? spot.c : 'var(--line)'}">
      <div class="itrow">
        <input type="checkbox" class="itdone" ${Number(r.done) === 1 ? 'checked' : ''} title="完成">
        ${r.time ? `<span class="ittime">${esc(r.time)}</span>` : ''}
        <span class="itemoji">${emoji}</span>
        <div class="itmain">
          <div class="ittitle">${esc(r.title)}</div>
          ${r.note ? `<div class="itnote">${esc(r.note)}</div>` : ''}
        </div>
        ${spot ? `<a class="itmap" href="${kakaoMapUrl(spot.n, spot.lat, spot.lng)}" target="_blank" rel="noopener" title="Kakao Map">📍</a>` : ''}
        <span class="ithandle" title="長按拖移">≡</span>
      </div>
      ${open ? `
      <div class="itedit">
        <div style="display:flex;gap:8px">
          <input type="date" class="ie-day" value="${esc(r.day)}" style="flex:1.4">
          <input type="time" class="ie-time" value="${esc(r.time || '')}" style="flex:1">
        </div>
        <input class="ie-title" value="${esc(r.title)}" placeholder="標題" style="margin-top:8px">
        <input class="ie-note" value="${esc(r.note || '')}" placeholder="備註" style="margin-top:8px">
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn ie-save" type="button">儲存</button>
          <button class="btn warn ie-del" type="button">刪除</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="daychips">${chips}</div>
    <div id="it-list">${cards || '<div class="placeholder"><span class="e">📅</span>這天還沒有行程，從下方加入</div>'}</div>
    <form class="card" id="it-form" data-spot-id="">
      <div style="display:flex;gap:8px">
        <input type="time" id="it-time" style="flex:1">
        <div style="flex:2.4;position:relative">
          <input id="it-title" placeholder="標題（輸入可搜尋景點庫）" autocomplete="off" required>
          <div id="it-sug" class="sug" hidden></div>
        </div>
      </div>
      <div id="it-linked" class="muted" hidden style="margin-top:6px"></div>
      <input id="it-note" placeholder="備註（選填）" style="margin-top:8px">
      <button class="btn" type="submit" style="margin-top:10px;width:100%">＋ 加入 <span id="it-daylabel"></span> 的行程</button>
    </form>`;

  el.querySelector('#it-daylabel').textContent = currentDay.slice(5).replace('-', '/');

  if (saved) {
    el.querySelector('#it-time').value = saved.time;
    el.querySelector('#it-title').value = saved.title;
    el.querySelector('#it-note').value = saved.note;
    el.querySelector('#it-form').dataset.spotId = saved.spotId;
    if (saved.spotId) showLinked(el, SPOTS.find(s => s.id === saved.spotId));
    if (saved.focusId) { const f = el.querySelector('#' + saved.focusId); if (f) f.focus(); }
  }

  bindItinerary(el, engine, items);
  initDrag(el, engine); // Task 4 實作；本 task 先放空函式
}

function showLinked(el, spot) {
  const box = el.querySelector('#it-linked');
  if (!spot) { box.hidden = true; box.textContent = ''; return; }
  box.hidden = false;
  box.innerHTML = `🔗 已連結景點：${esc(spot.n)}（${esc(spot.district)}）<button type="button" class="unlink" style="border:0;background:none;color:var(--vermilion);cursor:pointer">✕</button>`;
  box.querySelector('.unlink').onclick = () => { el.querySelector('#it-form').dataset.spotId = ''; showLinked(el, null); };
}

function bindItinerary(el, engine, items) {
  // 日期 chips
  el.querySelectorAll('.daychip').forEach(b => b.onclick = () => {
    currentDay = b.dataset.day; expandedId = null; renderItinerary(el, engine);
  });

  // 卡片
  el.querySelectorAll('.itcard').forEach(card => {
    const r = items.find(x => x.id === card.dataset.id);
    if (!r) return;
    card.querySelector('.itrow').onclick = ev => {
      if (ev.target.closest('.itdone,.itmap,.ithandle')) return;
      expandedId = expandedId === r.id ? null : r.id;
      renderItinerary(el, engine);
    };
    card.querySelector('.itdone').onchange = ev => {
      engine.upsert('itinerary', { ...r, done: ev.target.checked ? 1 : 0, updatedAt: Date.now() });
    };
    const save = card.querySelector('.ie-save');
    if (save) {
      save.onclick = () => {
        const day = card.querySelector('.ie-day').value || r.day;
        const time = card.querySelector('.ie-time').value;
        const title = card.querySelector('.ie-title').value.trim() || r.title;
        const note = card.querySelector('.ie-note').value.trim();
        let sortOrder = r.sortOrder;
        if (day !== r.day) sortOrder = insertOrderForTime(sortedDayItems(engine.data.itinerary, day), time); // 換天 → 依時間插入目標日
        expandedId = null;
        engine.upsert('itinerary', { ...r, day, time, title, note, sortOrder, updatedAt: Date.now() });
      };
      card.querySelector('.ie-del').onclick = () => {
        if (confirm(`刪除「${r.title}」？`)) {
          expandedId = null;
          engine.upsert('itinerary', { ...r, deleted: 1, updatedAt: Date.now() });
        }
      };
    }
  });

  // 景點庫搜尋
  const form = el.querySelector('#it-form');
  const titleInput = el.querySelector('#it-title');
  const sug = el.querySelector('#it-sug');
  titleInput.addEventListener('input', () => {
    form.dataset.spotId = ''; showLinked(el, null);
    const q = titleInput.value.trim();
    if (!q) { sug.hidden = true; return; }
    const hits = SPOTS.filter(s => s.n.includes(q) || s.ko.includes(q) || s.district.includes(q)).slice(0, 6);
    if (!hits.length) { sug.hidden = true; return; }
    sug.innerHTML = hits.map(s =>
      `<div class="sug-item" data-sid="${esc(s.id)}"><span class="sdot" style="background:${s.c}"></span>${CAT_EMOJI[s.cat] || '📍'} ${esc(s.n)}<small>${esc(s.ko)} · ${esc(s.district)}</small></div>`).join('');
    sug.hidden = false;
    sug.querySelectorAll('.sug-item').forEach(item => item.onclick = () => {
      const spot = SPOTS.find(s => s.id === item.dataset.sid);
      titleInput.value = spot.n;
      form.dataset.spotId = spot.id;
      showLinked(el, spot);
      sug.hidden = true;
    });
  });

  // 新增
  form.onsubmit = ev => {
    ev.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    const time = el.querySelector('#it-time').value;
    const note = el.querySelector('#it-note').value.trim();
    const spotId = form.dataset.spotId || '';
    // 先清欄位再 upsert：onChange 會同步重繪，否則 capture/restore 會把剛送出的值復活
    titleInput.value = ''; el.querySelector('#it-note').value = ''; el.querySelector('#it-time').value = '';
    form.dataset.spotId = ''; showLinked(el, null); sug.hidden = true;
    engine.upsert('itinerary', {
      id: crypto.randomUUID(), day: currentDay, time, title, spotId, note,
      sortOrder: insertOrderForTime(sortedDayItems(engine.data.itinerary, currentDay), time),
      done: 0, updatedAt: Date.now(), deleted: 0,
    });
  };
}

/* Task 4 覆寫；本 task 先佔位避免 ReferenceError */
function initDrag(el, engine) {}
