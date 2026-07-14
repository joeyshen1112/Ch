# 旅遊工具 PWA — 行程 tab 實作計畫（Plan 2/3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作行程 tab——日期 chips、卡片時間軸、景點庫搜尋帶入、長按拖移排序（sortOrder）、Kakao Map 導航連結。

**Architecture:** 重用 Plan 1 的 SyncEngine 與 GAS `itinerary` 分頁（欄位已就緒：`id,day,time,title,spotId,note,sortOrder,done,updatedAt,deleted`）。順序真相來源是 `sortOrder`（浮點，拖移取前後中點、間距過小時整日重整），time 只是選填標籤。景點庫由 busan.html 的 DISTRICTS 一次性抽出成模組（已 spike 驗證：12 區 97 景點）。拖移用 vendor 的 SortableJS（repo 已有內嵌 Leaflet 先例）。

**Tech Stack:** Vanilla JS ES modules、SortableJS 1.15.6（vendored）、node:test。

**Spec:** `docs/superpowers/specs/2026-07-13-pwa-travel-tools-design.md` §3（資料模型）、§7 行程 tab。

## Global Constraints

- 零建置：不引入 npm 套件；`tools/`、`tests/` 為 dev-only（node:test，Node 23 用 `node --test` 不帶目錄參數）。
- 全部相對路徑（GitHub Pages `/Ch/` 專案路徑下必須正常）。
- 順序規則：`sortOrder` 為排序真相來源；新增有 time 者按 time 插入、無 time 排當日最後；拖移＝前後中點；相鄰間距 < 1e-6 時整日重整為 1..n。
- 拖移手勢：長按把手（≡）300ms 啟動；**拖移進行中禁止重繪**（背景輪詢的 onChange 需延後到拖移結束）。
- 所有使用者/Sheet 來源字串進 innerHTML 前必須 `esc()`。
- 表單保留：背景重繪不得清空打到一半的新增表單（沿用 expenses 的 capture/restore 模式；提交時先清欄位再 upsert，因 onChange 同步觸發）。
- 行程天數由 settings `tripStart`/`tripEnd` 產生，缺值 fallback `2026-10-22`/`2026-10-29`；天數上限 60 防呆。
- UI 文案繁體中文；沿用 hanji 配色變數。
- Commit：Conventional Commits、無 scope 括號、無 Co-Authored-By。

---

### Task 1: 景點庫模組（抽取工具＋產生檔＋完整性測試）

**Files:**
- Create: `tools/extract-spots.mjs`
- Create: `app/spots-data.js`（由工具產生後 commit）
- Create: `tests/spots.test.mjs`

**Interfaces:**
- Produces: `export const SPOTS = [{id:'haeundae-0', n:'海雲台海水浴場', ko:'해운대해수욕장', cat:'海灘', lat:35.1587, lng:129.1604, district:'海雲台', c:'#E2674A', cold:false}, …]`（97 筆；id=`<分區id>-<index>` 唯一）

- [ ] **Step 1: 寫 `tools/extract-spots.mjs`**

```javascript
/* 一次性工具：從 busan.html 抽出景點庫，產生 app/spots-data.js
 * 用法：node tools/extract-spots.mjs（在 repo 根目錄執行）。地圖資料更新後重跑即可。 */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('busan.html', 'utf8');
const start = html.indexOf('const DISTRICTS = [');
const end = html.indexOf('];', start);
if (start === -1 || end === -1) throw new Error('busan.html 裡找不到 DISTRICTS');
const ctx = {};
vm.runInNewContext(html.slice(start, end + 2) + '; out = DISTRICTS;', ctx);
const spots = ctx.out.flatMap(d => d.spots.map((s, i) => ({
  id: `${d.id}-${i}`, n: s.n, ko: s.ko, cat: s.cat, lat: s.lat, lng: s.lng,
  district: d.name, c: d.c, cold: !!s.cold,
})));
const body = spots.map(s => '  ' + JSON.stringify(s)).join(',\n');
writeFileSync('app/spots-data.js',
  `/* 由 tools/extract-spots.mjs 自 busan.html 產生——請勿手改；地圖資料更新後重跑該工具 */\nexport const SPOTS = [\n${body},\n];\n`);
console.log(`OK: ${spots.length} spots → app/spots-data.js`);
```

- [ ] **Step 2: 寫失敗測試 `tests/spots.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS } from '../app/spots-data.js';

test('SPOTS 資料完整性', () => {
  assert.equal(SPOTS.length >= 90, true);
  assert.equal(new Set(SPOTS.map(s => s.id)).size, SPOTS.length); // id 唯一
  for (const s of SPOTS) {
    assert.equal(typeof s.n === 'string' && s.n.length > 0, true);
    assert.equal(typeof s.ko === 'string' && s.ko.length > 0, true);
    assert.equal(typeof s.cat, 'string');
    assert.equal(Number.isFinite(s.lat) && Number.isFinite(s.lng), true);
    assert.equal(typeof s.district === 'string' && s.district.length > 0, true);
    assert.match(s.c, /^#[0-9A-Fa-f]{6}$/);
  }
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `node --test`
Expected: 既有 17 PASS，新增 1 FAIL（`app/spots-data.js` 不存在）

- [ ] **Step 4: 執行工具產生模組**

Run: `node tools/extract-spots.mjs`
Expected: `OK: 97 spots → app/spots-data.js`

- [ ] **Step 5: 跑測試確認通過**

Run: `node --test`
Expected: 18 tests PASS

- [ ] **Step 6: Commit**

```bash
git add tools/extract-spots.mjs app/spots-data.js tests/spots.test.mjs
git commit -m "feat: add spots data module extracted from busan map"
```

---

### Task 2: 行程排序純函式＋測試

**Files:**
- Create: `app/itinerary.js`（本 task 只含純函式；Task 3 會在同檔追加 UI）
- Create: `tests/itinerary.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `SPOTS`（本 task 只 import 不使用，供 Task 3 用）
- Produces（Task 3/4 依賴，簽名固定）:
  - `dayRange(start:'YYYY-MM-DD', end): string[]`（含端點；非法/顛倒回 `[]`；上限 60 天）
  - `sortedDayItems(records:Object, day): Array`（排除 deleted，依 sortOrder 升冪、updatedAt 次序）
  - `midpoint(prev:number|null, next:number|null): number`
  - `insertOrderForTime(items:Array, time:string): number`
  - `needsRenorm(items): boolean`（相鄰 sortOrder 間距 < 1e-6）
  - `renormalize(items): Array`（整筆 record 複本、sortOrder=1..n）
  - `kakaoMapUrl(name, lat, lng): string`

- [ ] **Step 1: 寫失敗測試 `tests/itinerary.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayRange, sortedDayItems, midpoint, insertOrderForTime, needsRenorm, renormalize, kakaoMapUrl } from '../app/itinerary.js';

test('dayRange 起訖含端點', () => {
  const days = dayRange('2026-10-22', '2026-10-29');
  assert.equal(days.length, 8);
  assert.equal(days[0], '2026-10-22');
  assert.equal(days[7], '2026-10-29');
});

test('dayRange 非法輸入回空陣列', () => {
  assert.deepEqual(dayRange('bad', '2026-10-29'), []);
  assert.deepEqual(dayRange('2026-10-29', '2026-10-22'), []);
});

test('midpoint 邊界', () => {
  assert.equal(midpoint(null, null), 1);
  assert.equal(midpoint(null, 5), 4);
  assert.equal(midpoint(5, null), 6);
  assert.equal(midpoint(1, 2), 1.5);
});

test('insertOrderForTime：依時間插入、無時間排最後', () => {
  const items = [
    { id: 'a', time: '09:00', sortOrder: 1 },
    { id: 'b', time: '12:00', sortOrder: 2 },
  ];
  assert.equal(insertOrderForTime(items, '10:30'), 1.5); // 09:00 與 12:00 之間
  assert.equal(insertOrderForTime(items, ''), 3);        // 無時間 → 最後
  assert.equal(insertOrderForTime(items, '08:00'), 0);   // 比全部早 → 最前（midpoint(null,1)）
  assert.equal(insertOrderForTime([], '10:00'), 1);      // 空日 → 1
});

test('sortedDayItems 過濾與排序', () => {
  const records = {
    a: { id: 'a', day: 'D', sortOrder: 2, updatedAt: 1, deleted: 0 },
    b: { id: 'b', day: 'D', sortOrder: 1, updatedAt: 1, deleted: 0 },
    c: { id: 'c', day: 'D', sortOrder: 3, updatedAt: 1, deleted: 1 },
    d: { id: 'd', day: 'E', sortOrder: 0, updatedAt: 1, deleted: 0 },
  };
  assert.deepEqual(sortedDayItems(records, 'D').map(r => r.id), ['b', 'a']);
});

test('needsRenorm 與 renormalize', () => {
  assert.equal(needsRenorm([{ sortOrder: 1 }, { sortOrder: 1 + 1e-9 }]), true);
  assert.equal(needsRenorm([{ sortOrder: 1 }, { sortOrder: 2 }]), false);
  const out = renormalize([{ id: 'x', sortOrder: 0.5 }, { id: 'y', sortOrder: 0.6 }]);
  assert.deepEqual(out.map(r => r.sortOrder), [1, 2]);
  assert.equal(out[0].id, 'x'); // 保持原順序、整筆複本
});

test('kakaoMapUrl 編碼', () => {
  assert.equal(kakaoMapUrl('佛國寺', 35.78988, 129.33189),
    'https://map.kakao.com/link/map/%E4%BD%9B%E5%9C%8B%E5%AF%BA,35.78988,129.33189');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test`
Expected: 18 PASS＋7 FAIL（模組不存在）

- [ ] **Step 3: 寫 `app/itinerary.js`（純函式部分）**

```javascript
/* app/itinerary.js — 行程 tab：日期 chips、卡片時間軸、景點庫搜尋、拖移排序 */
import { SPOTS } from './spots-data.js';

const CAT_EMOJI = { '海灘':'🏖️','觀景':'🌅','寺廟':'⛩️','咖啡':'☕','市場':'🛒','拍照':'📸','自然':'🌿','夜景':'🌃','美食':'🍜','購物':'🛍️','體驗':'🎡','親子':'🧸','歷史':'🏛️' };

/* ---------- 純函式（排序邏輯，見 tests/itinerary.test.mjs） ---------- */
export function dayRange(start, end) {
  const s = new Date(start + 'T00:00:00Z'), e = new Date(end + 'T00:00:00Z');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];
  const out = [];
  for (let t = s.getTime(); t <= e.getTime() && out.length < 60; t += 86400000) {
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test`
Expected: 25 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/itinerary.js tests/itinerary.test.mjs
git commit -m "feat: add itinerary ordering helpers"
```

---

### Task 3: 行程 UI（renderItinerary＋app.html 接線＋CSS）

**Files:**
- Modify: `app/itinerary.js`（檔尾追加 UI 區塊）
- Modify: `app.html`（import、TABS.itinerary 接線）
- Modify: `app/app.css`（檔尾追加行程樣式）

**Interfaces:**
- Consumes: Task 1 `SPOTS`、Task 2 全部純函式、SyncEngine（`engine.data.itinerary`、`engine.data.settings`、`engine.upsert('itinerary', record)`）
- Produces: `renderItinerary(el, engine)`；模組級狀態 `dragging`（Task 4 拖移用，本 task 先建立含守門邏輯）

- [ ] **Step 1: 在 `app/itinerary.js` 檔尾追加 UI 區塊**

```javascript
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
```

- [ ] **Step 2: `app.html` 接線（兩處修改）**

在 `import { renderExpenses } ...` 下一行加：
```javascript
import { renderItinerary } from './app/itinerary.js';
```
把 `TABS` 的 itinerary 佔位行換成：
```javascript
  itinerary: el => renderItinerary(el, engine),
```

- [ ] **Step 3: `app/app.css` 檔尾追加**

```css
/* ---------- 行程 tab ---------- */
.daychips{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;-webkit-overflow-scrolling:touch}
.daychip{flex:none;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:7px 12px;font-size:.88rem;color:var(--ink-soft);cursor:pointer;line-height:1.2}
.daychip small{display:block;font-size:.66rem;opacity:.75}
.daychip.on{background:var(--pine);color:var(--hanji);border-color:var(--pine);font-weight:700}
.daychip.today:not(.on){border-color:var(--brass);color:var(--brass);font-weight:700}
.itcard{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--dc);border-radius:11px;margin-bottom:9px}
.itcard.done .ittitle{text-decoration:line-through;opacity:.55}
.itcard.done .itnote{opacity:.45}
.itrow{display:flex;align-items:center;gap:9px;padding:11px 12px;cursor:pointer}
.itdone{width:19px;height:19px;flex:none;accent-color:var(--celadon)}
.ittime{font-family:"Noto Serif TC",serif;font-weight:700;color:var(--maple, #c4642a);font-size:.86rem;flex:none}
.itemoji{font-size:1.15rem;flex:none}
.itmain{flex:1;min-width:0}
.ittitle{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.itnote{font-size:.78rem;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.itmap{text-decoration:none;font-size:1.05rem;flex:none}
.ithandle{color:#b8ad96;font-size:1.2rem;padding:4px 2px;flex:none;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.itedit{border-top:1px dashed var(--line);padding:12px}
.sortable-ghost{opacity:.4}
.sortable-chosen{box-shadow:0 8px 24px -10px rgba(35,23,15,.5)}
.sug{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:10px;z-index:20;box-shadow:0 10px 30px -12px rgba(35,23,15,.4);overflow:hidden}
.sug-item{display:flex;align-items:center;gap:7px;padding:9px 11px;font-size:.88rem;cursor:pointer}
.sug-item:hover{background:#f6efe1}
.sug-item small{margin-left:auto;color:#9c8a72}
.sdot{width:9px;height:9px;border-radius:50%;flex:none}
```

- [ ] **Step 4: 跑全部測試（確保純函式未被 UI 追加破壞）**

Run: `node --test`
Expected: 25 tests PASS（UI 程式碼在 module 頂層不得觸碰 document/window，import 時才不會在 Node 掛掉）

- [ ] **Step 5: 本機手動驗證**

`http://localhost:8080/app.html`（server 已在跑）→ 行程 tab：
- 日期 chips 10/22–10/29、今天標記；切換日期正常。
- 輸入「海」→ 下拉出現海雲台景點；點選 → 連結 chip 出現、卡片帶分區色與 📍。
- 加一筆有時間、一筆無時間 → 依時間排序、無時間在最後。
- 點卡片展開 → 改標題/時間/備註/換天 → 正確更新；勾完成 → 劃掉；刪除 → 消失。
- 打字到一半等 20 秒輪詢 → 表單內容不消失。
- 第二個無痕視窗 → 同步看到行程。

- [ ] **Step 6: Commit**

```bash
git add app/itinerary.js app.html app/app.css
git commit -m "feat: add itinerary tab with day timeline and spot search"
```

---

### Task 4: 拖移排序（vendor SortableJS＋sortOrder 中點/重整）

**Files:**
- Create: `app/vendor/Sortable.min.js`（vendored 1.15.6）
- Modify: `app.html`（加 script 標籤）
- Modify: `app/itinerary.js`（實作 initDrag）

**Interfaces:**
- Consumes: Task 2 `midpoint`/`needsRenorm`/`renormalize`/`sortedDayItems`、Task 3 `dragState`、全域 `window.Sortable`（UMD）
- Produces: 拖移重排寫回 sortOrder（單筆或整日重整）

- [ ] **Step 1: vendor SortableJS**

```bash
mkdir -p app/vendor
curl -sL -o app/vendor/Sortable.min.js https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js
head -c 120 app/vendor/Sortable.min.js   # 應以 /*! Sortable 1.15.6 開頭（MIT）
```

- [ ] **Step 2: `app.html` 在 `<script type="module">` 之前加**

```html
<script src="app/vendor/Sortable.min.js"></script>
```

- [ ] **Step 3: 以下列實作取代 `app/itinerary.js` 檔尾的空 `initDrag`**

```javascript
/* 拖移排序：長按把手 300ms 啟動；一次拖移只寫一筆（前後中點），間距耗盡時整日重整 */
function initDrag(el, engine) {
  const list = el.querySelector('#it-list');
  if (!window.Sortable || !list || !list.querySelector('.itcard')) return;
  window.Sortable.create(list, {
    handle: '.ithandle',
    draggable: '.itcard',
    animation: 150,
    delay: 300,
    delayOnTouchOnly: false,
    onStart() { dragState.dragging = true; },
    onEnd(evt) {
      dragState.dragging = false;
      const pending = dragState.pending; dragState.pending = null;
      const rerenderPending = () => { if (pending) renderItinerary(pending.el, pending.engine); };
      if (evt.oldIndex === evt.newIndex) { rerenderPending(); return; }
      const items = sortedDayItems(engine.data.itinerary, currentDay);
      const moved = items[evt.oldIndex];
      if (!moved) { rerenderPending(); return; }
      const rest = items.filter((_, i) => i !== evt.oldIndex);
      rest.splice(evt.newIndex, 0, moved);
      const prev = rest[evt.newIndex - 1], next = rest[evt.newIndex + 1];
      const order = midpoint(prev ? prev.sortOrder : null, next ? next.sortOrder : null);
      const collide = (prev && Math.abs(order - Number(prev.sortOrder)) < 1e-6)
                   || (next && Math.abs(order - Number(next.sortOrder)) < 1e-6);
      if (collide) {
        renormalize(rest).forEach(r => engine.upsert('itinerary', { ...r, updatedAt: Date.now() })); // 整日重整（≤數十筆，一批送出）
      } else {
        engine.upsert('itinerary', { ...moved, sortOrder: order, updatedAt: Date.now() });
      }
      // upsert 的 onChange 會同步重繪，把 Sortable 動過的 DOM 重建為一致狀態
    },
  });
}
```

- [ ] **Step 4: 跑全部測試**

Run: `node --test`
Expected: 25 tests PASS

- [ ] **Step 5: 本機手動驗證（拖移無法自動測，plan-mandated 手動項）**

- 桌機：按住 ≡ 300ms 拖動卡片 → 放開落位、順序保存；重整頁面順序不變。
- 拖移進行中等到 20 秒輪詢發生 → 拖移不中斷、放開後畫面正確。
- 第二視窗 → 順序同步一致。
- 反覆在同兩張卡片間拖 20+ 次 → 不噴錯（間距耗盡觸發整日重整路徑）。
- iOS Simulator Safari（`http://localhost:8080/app.html`）：長按把手拖移正常、頁面不跟著捲動。

- [ ] **Step 6: Commit**

```bash
git add app/vendor/Sortable.min.js app.html app/itinerary.js
git commit -m "feat: add drag reorder with fractional sort order"
```

---

### Task 5: 雙視窗端對端驗收（控制者與使用者執行）

**Files:** 無（驗證；發現 bug 才回頭修）

- [ ] 跑全部測試：`node --test` → 25 PASS
- [ ] 雙視窗清單：A 加行程 → B 20 秒內出現；A 拖移重排 → B 順序一致；B 離線加兩筆 → 恢復後 A 看到且順序正確；A 換天移動 → B 跟著移；勾完成/刪除同步。
- [ ] Sheet 檢查：itinerary 分頁出現資料列、sortOrder 為數字、手動改 title 後兩視窗同步到。

---

## 後續（不在本計畫）

Plan 3：韓文 tab（內建短語＋Sheet phrases 同步＋全螢幕大字＋Papago 外連）、manifest.json＋sw.js＋icons、index.html 目錄卡片、spike.html 去留。
