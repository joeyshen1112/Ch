# 旅遊工具 PWA — 韓文短語＋PWA 安裝打磨 實作計畫（Plan 3/3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成最後一塊——🇰🇷 韓文短語 tab（內建 50 句＋Sheet 同步＋全螢幕大字＋Papago 外連）、PWA 安裝能力（manifest／service worker／圖示／加入主畫面提示）、index.html 目錄卡片。

**Architecture:** phrases 資料為「內建清單 ∪ Sheet phrases 分頁」聯集（Sheet 唯讀同步已在 SyncEngine 就緒）；SW 只做 app shell 的 cache-first（GAS 請求不經 SW，離線由 sync.js 佇列處理）；圖示以 SVG 經 macOS 內建 qlmanage 轉 PNG。

**Tech Stack:** Vanilla JS ES modules、Service Worker、node:test。

**Spec:** `docs/superpowers/specs/2026-07-13-pwa-travel-tools-design.md` §7 韓文 tab、§8 PWA 與離線。

## Global Constraints

- 零建置；`tools/`、`tests/` dev-only（node:test，Node 23 用 `node --test` 不帶目錄參數）。
- 全部相對路徑（GitHub Pages `/Ch/` 專案路徑）；manifest `start_url`/`scope` 用 `./` 相對形式。
- **CSS 有改動就要 bump 版本**：本計畫將 `app.css?v=2` 升為 `?v=3`。
- SW 快取名版本化（`tt-v1`），改 shell 檔案清單或內容時 bump；GAS／跨域請求一律不攔截。
- 所有 record/使用者字串進 innerHTML 前 `esc()`；模組頂層 Node-safe（不碰 document/window）。
- phrases 顯示規則（spec §3）：內建與 Sheet 列聯集、各分類內先內建後 Sheet、不去重。
- UI 繁體中文；沿用 hanji 配色。Commit：Conventional Commits、無 scope、無 Co-Authored-By。

---

### Task 1: 韓文 tab（phrases.js＋內建短語＋測試＋接線）

**Files:**
- Create: `app/phrases.js`
- Create: `tests/phrases.test.mjs`
- Modify: `app.html`（import＋TABS.phrases 接線＋CSS 版本 v=3）
- Modify: `app/app.css`（檔尾追加韓文 tab 樣式）

**Interfaces:**
- Consumes: `engine.data.phrases`（Sheet 同步、可能為空陣列）、既有 `.daychip` chips 樣式
- Produces: `BUILTIN_PHRASES`、`allPhrases(sheetRows):Array`、`papagoUrl(text):string`、`renderPhrases(el, engine)`

- [ ] **Step 1: 寫失敗測試 `tests/phrases.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PHRASES, allPhrases, papagoUrl } from '../app/phrases.js';

test('內建短語完整性：至少 45 句、五分類齊全、欄位完整', () => {
  assert.equal(BUILTIN_PHRASES.length >= 45, true);
  const cats = new Set(BUILTIN_PHRASES.map(p => p.category));
  for (const c of ['點餐', '交通', '購物', '住宿', '緊急']) assert.equal(cats.has(c), true);
  for (const p of BUILTIN_PHRASES) {
    assert.equal(typeof p.zh === 'string' && p.zh.length > 0, true);
    assert.equal(typeof p.ko === 'string' && p.ko.length > 0, true);
    assert.equal(typeof p.roman === 'string' && p.roman.length > 0, true);
  }
});

test('allPhrases：內建與 Sheet 聯集、分類內先內建後 Sheet、略過缺欄位列', () => {
  const sheet = [
    { category: '點餐', zh: '請給我烤肉', ko: '고기 주세요', roman: 'go-gi ju-se-yo' },
    { category: '點餐', zh: '', ko: 'x', roman: '' }, // 缺 zh → 略過
  ];
  const out = allPhrases(sheet);
  assert.equal(out.length, BUILTIN_PHRASES.length + 1);
  const dining = out.filter(p => p.category === '點餐');
  assert.equal(dining[dining.length - 1].zh, '請給我烤肉'); // Sheet 排在該分類最後
});

test('papagoUrl 編碼', () => {
  assert.equal(papagoUrl('這個可以刷卡嗎？'),
    'https://papago.naver.com/?sk=zh-TW&tk=ko&st=' + encodeURIComponent('這個可以刷卡嗎？'));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test`
Expected: 既有 27 PASS，新增 3 FAIL（模組不存在）

- [ ] **Step 3: 寫 `app/phrases.js`**

```javascript
/* app/phrases.js — 韓文短語 tab：內建清單＋Sheet 聯集、全螢幕大字、Papago 外連 */

export const PHRASE_CATS = ['點餐', '交通', '購物', '住宿', '緊急'];

export const BUILTIN_PHRASES = [
  // 點餐
  { category: '點餐', zh: '請給我這個', ko: '이거 주세요', roman: 'i-geo ju-se-yo' },
  { category: '點餐', zh: '請給我菜單', ko: '메뉴판 주세요', roman: 'me-nyu-pan ju-se-yo' },
  { category: '點餐', zh: '有中文菜單嗎？', ko: '중국어 메뉴 있어요?', roman: 'jung-gu-geo me-nyu i-sseo-yo' },
  { category: '點餐', zh: '推薦什麼（什麼好吃）？', ko: '뭐가 맛있어요?', roman: 'mwo-ga ma-si-sseo-yo' },
  { category: '點餐', zh: '不要太辣', ko: '안 맵게 해주세요', roman: 'an maep-ge hae-ju-se-yo' },
  { category: '點餐', zh: '請給我兩人份', ko: '이 인분 주세요', roman: 'i in-bun ju-se-yo' },
  { category: '點餐', zh: '請給我水', ko: '물 주세요', roman: 'mul ju-se-yo' },
  { category: '點餐', zh: '很好吃！', ko: '맛있어요!', roman: 'ma-si-sseo-yo' },
  { category: '點餐', zh: '請幫我結帳', ko: '계산해 주세요', roman: 'gye-san-hae ju-se-yo' },
  { category: '點餐', zh: '可以刷卡嗎？', ko: '카드 되나요?', roman: 'ka-deu doe-na-yo' },
  { category: '點餐', zh: '請幫我打包', ko: '포장해 주세요', roman: 'po-jang-hae ju-se-yo' },
  { category: '點餐', zh: '請分開結帳', ko: '따로 계산해 주세요', roman: 'tta-ro gye-san-hae ju-se-yo' },
  // 交通
  { category: '交通', zh: '請到這裡（給司機看地址）', ko: '여기로 가주세요', roman: 'yeo-gi-ro ga-ju-se-yo' },
  { category: '交通', zh: '請在這裡停', ko: '여기서 세워주세요', roman: 'yeo-gi-seo se-wo-ju-se-yo' },
  { category: '交通', zh: '到這裡多少錢？', ko: '여기까지 얼마예요?', roman: 'yeo-gi-kka-ji eol-ma-ye-yo' },
  { category: '交通', zh: '這班車到釜山站嗎？', ko: '이 버스 부산역 가요?', roman: 'i beo-seu bu-san-yeok ga-yo' },
  { category: '交通', zh: '地鐵站在哪裡？', ko: '지하철역이 어디예요?', roman: 'ji-ha-cheol-yeok-i eo-di-ye-yo' },
  { category: '交通', zh: '請幫我叫計程車', ko: '택시 불러 주세요', roman: 'taek-si bul-leo ju-se-yo' },
  { category: '交通', zh: '我要在這站下車', ko: '내릴게요', roman: 'nae-ril-ge-yo' },
  { category: '交通', zh: '走路可以到嗎？', ko: '걸어서 갈 수 있어요?', roman: 'geo-reo-seo gal su i-sseo-yo' },
  { category: '交通', zh: '廁所在哪裡？', ko: '화장실이 어디예요?', roman: 'hwa-jang-sil-i eo-di-ye-yo' },
  { category: '交通', zh: '這裡怎麼去（指圖）？', ko: '여기 어떻게 가요?', roman: 'yeo-gi eo-tteo-ke ga-yo' },
  // 購物
  { category: '購物', zh: '多少錢？', ko: '얼마예요?', roman: 'eol-ma-ye-yo' },
  { category: '購物', zh: '太貴了', ko: '너무 비싸요', roman: 'neo-mu bi-ssa-yo' },
  { category: '購物', zh: '可以算便宜一點嗎？', ko: '좀 깎아 주세요', roman: 'jom kkak-ka ju-se-yo' },
  { category: '購物', zh: '可以試穿嗎？', ko: '입어 봐도 돼요?', roman: 'i-beo bwa-do dwae-yo' },
  { category: '購物', zh: '有別的顏色嗎？', ko: '다른 색 있어요?', roman: 'da-reun saek i-sseo-yo' },
  { category: '購物', zh: '有更大的尺寸嗎？', ko: '더 큰 사이즈 있어요?', roman: 'deo keun sa-i-jeu i-sseo-yo' },
  { category: '購物', zh: '我要退稅', ko: '텍스 리펀 해주세요', roman: 'tek-seu ri-peon hae-ju-se-yo' },
  { category: '購物', zh: '只是看看', ko: '그냥 구경할게요', roman: 'geu-nyang gu-gyeong-hal-ge-yo' },
  { category: '購物', zh: '請給我袋子', ko: '봉투 주세요', roman: 'bong-tu ju-se-yo' },
  { category: '購物', zh: '這是什麼？', ko: '이게 뭐예요?', roman: 'i-ge mwo-ye-yo' },
  // 住宿
  { category: '住宿', zh: '我有預約', ko: '예약했어요', roman: 'ye-yak-hae-sseo-yo' },
  { category: '住宿', zh: '可以寄放行李嗎？', ko: '짐 맡길 수 있어요?', roman: 'jim mat-gil su i-sseo-yo' },
  { category: '住宿', zh: '退房是幾點？', ko: '체크아웃 몇 시예요?', roman: 'che-keu-a-ut myeot si-ye-yo' },
  { category: '住宿', zh: 'WiFi 密碼是什麼？', ko: '와이파이 비밀번호가 뭐예요?', roman: 'wa-i-pa-i bi-mil-beon-ho-ga mwo-ye-yo' },
  { category: '住宿', zh: '請再給我一條毛巾', ko: '수건 하나 더 주세요', roman: 'su-geon ha-na deo ju-se-yo' },
  { category: '住宿', zh: '冷氣壞了', ko: '에어컨이 고장났어요', roman: 'e-eo-keon-i go-jang-na-sseo-yo' },
  { category: '住宿', zh: '可以延後退房嗎？', ko: '레이트 체크아웃 돼요?', roman: 're-i-teu che-keu-a-ut dwae-yo' },
  { category: '住宿', zh: '附近有便利商店嗎？', ko: '근처에 편의점 있어요?', roman: 'geun-cheo-e pyeon-ui-jeom i-sseo-yo' },
  // 緊急
  { category: '緊急', zh: '請幫幫我', ko: '도와주세요', roman: 'do-wa-ju-se-yo' },
  { category: '緊急', zh: '我不會說韓文', ko: '한국어를 못해요', roman: 'han-gu-geo-reul mot-hae-yo' },
  { category: '緊急', zh: '會說英文嗎？', ko: '영어 할 수 있어요?', roman: 'yeong-eo hal su i-sseo-yo' },
  { category: '緊急', zh: '我迷路了', ko: '길을 잃었어요', roman: 'gi-reul i-reo-sseo-yo' },
  { category: '緊急', zh: '我的手機不見了', ko: '휴대폰을 잃어버렸어요', roman: 'hyu-dae-pon-eul i-reo-beo-ryeo-sseo-yo' },
  { category: '緊急', zh: '請叫警察', ko: '경찰을 불러 주세요', roman: 'gyeong-cha-reul bul-leo ju-se-yo' },
  { category: '緊急', zh: '請叫救護車', ko: '구급차를 불러 주세요', roman: 'gu-geup-cha-reul bul-leo ju-se-yo' },
  { category: '緊急', zh: '我不舒服', ko: '몸이 아파요', roman: 'mom-i a-pa-yo' },
  { category: '緊急', zh: '附近有藥局嗎？', ko: '근처에 약국이 있어요?', roman: 'geun-cheo-e yak-guk-i i-sseo-yo' },
  { category: '緊急', zh: '請再說一次', ko: '다시 한번 말해 주세요', roman: 'da-si han-beon mal-hae ju-se-yo' },
];

/* 內建 ∪ Sheet：各分類內先內建後 Sheet、缺欄位列略過、不去重（spec §3） */
export function allPhrases(sheetRows) {
  const extra = (sheetRows || []).filter(p => p && p.category && p.zh && p.ko);
  const out = [];
  const cats = [...PHRASE_CATS];
  for (const row of extra) if (!cats.includes(row.category)) cats.push(row.category); // Sheet 自訂分類排最後
  for (const c of cats) {
    out.push(...BUILTIN_PHRASES.filter(p => p.category === c));
    out.push(...extra.filter(p => p.category === c));
  }
  return out;
}

export function papagoUrl(text) {
  return `https://papago.naver.com/?sk=zh-TW&tk=ko&st=${encodeURIComponent(text)}`;
}

/* ---------- UI ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let currentCat = '全部';

export function renderPhrases(el, engine) {
  const phrases = allPhrases(engine.data.phrases);
  const cats = ['全部', ...new Set(phrases.map(p => p.category))];
  const list = currentCat === '全部' ? phrases : phrases.filter(p => p.category === currentCat);

  const chips = cats.map(c =>
    `<button type="button" class="daychip${c === currentCat ? ' on' : ''}" data-cat="${esc(c)}" style="min-width:auto;font-family:'Noto Sans TC'">${esc(c)}</button>`).join('');

  const cards = list.map((p, i) => `
    <div class="phrase" data-i="${i}">
      <div class="p-zh">${esc(p.zh)}</div>
      <div class="p-ko">${esc(p.ko)}</div>
      <div class="p-ro">${esc(p.roman || '')}</div>
    </div>`).join('');

  el.innerHTML = `
    <form class="card" id="pg-form" style="display:flex;gap:8px;align-items:center">
      <input id="pg-text" placeholder="輸入中文，開 Papago 翻譯成韓文" style="flex:1">
      <button class="btn" type="submit" style="flex:none">開 Papago</button>
    </form>
    <div class="daychips">${chips}</div>
    <div id="phrase-list">${cards}</div>
    <div class="foot muted" style="font-size:.74rem;padding:8px 2px 20px">點短語卡片會放大全螢幕（拿給店員看）。想加句子：直接在 Google Sheet 的 phrases 分頁新增，同步後就會出現。</div>
    <div id="p-big" hidden>
      <div class="p-big-ko"></div>
      <div class="p-big-zh"></div>
      <div class="p-big-hint">點任意處關閉</div>
    </div>`;

  el.querySelector('#pg-form').onsubmit = ev => {
    ev.preventDefault();
    const t = el.querySelector('#pg-text').value.trim();
    if (t) window.open(papagoUrl(t), '_blank', 'noopener');
  };
  el.querySelectorAll('.daychip').forEach(b => b.onclick = () => { currentCat = b.dataset.cat; renderPhrases(el, engine); });
  const big = el.querySelector('#p-big');
  el.querySelectorAll('.phrase').forEach(card => card.onclick = () => {
    const p = list[Number(card.dataset.i)];
    big.querySelector('.p-big-ko').textContent = p.ko;
    big.querySelector('.p-big-zh').textContent = p.zh;
    big.hidden = false;
  });
  big.onclick = () => { big.hidden = true; };
}
```

- [ ] **Step 4: `app.html` 接線（三處）**

1. import 區加：`import { renderPhrases } from './app/phrases.js';`
2. `TABS` 的 phrases 佔位行換成：`phrases: el => renderPhrases(el, engine),`
3. `<link rel="stylesheet" href="app/app.css?v=2">` 改為 `?v=3`（本 task 動了 CSS）。

- [ ] **Step 5: `app/app.css` 檔尾追加**

```css
/* ---------- 韓文 tab ---------- */
.phrase{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:9px;cursor:pointer;box-shadow:0 8px 22px -18px rgba(35,23,15,.5)}
.phrase:active{transform:scale(.99)}
.p-zh{font-size:.82rem;color:var(--ink-soft)}
.p-ko{font-family:"Noto Serif TC",serif;font-weight:700;font-size:1.28rem;color:var(--pine);margin:2px 0;line-height:1.4}
.p-ro{font-size:.74rem;color:#9c8a72;letter-spacing:.02em}
#p-big{position:fixed;inset:0;z-index:100;background:var(--hanji);display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:32px;cursor:pointer}
#p-big[hidden]{display:none}
.p-big-ko{font-family:"Noto Serif TC",serif;font-weight:900;font-size:clamp(2.2rem,10vw,4.2rem);color:var(--pine);line-height:1.35;word-break:keep-all}
.p-big-zh{margin-top:18px;font-size:1.05rem;color:var(--ink-soft)}
.p-big-hint{position:absolute;bottom:calc(24px + env(safe-area-inset-bottom,0px));font-size:.74rem;color:#b8ad96}
```

- [ ] **Step 6: 跑測試**

Run: `node --test`
Expected: 30 tests PASS

- [ ] **Step 7: Commit**

```bash
git add app/phrases.js tests/phrases.test.mjs app.html app/app.css
git commit -m "feat: add korean phrases tab with fullscreen mode and papago link"
```

---

### Task 2: PWA 安裝（icons＋manifest＋service worker＋加入主畫面提示）

**Files:**
- Create: `tools/icon.svg`、`tools/make-icons.sh`
- Create: `app/icons/icon-512.png`、`app/icons/icon-192.png`、`app/icons/apple-touch-icon.png`（由工具產生）
- Create: `manifest.json`、`sw.js`
- Modify: `app.html`（head meta＋SW 註冊＋加入主畫面提示）

**Interfaces:**
- Consumes: 既有 app shell 檔案清單（sw.js 的 SHELL 陣列）
- Produces: 可安裝 PWA（standalone、離線 shell）

- [ ] **Step 1: 寫 `tools/icon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#16332c"/>
  <rect x="106" y="106" width="300" height="300" rx="34" fill="#b23528" transform="rotate(-5 256 256)"/>
  <text x="256" y="268" font-family="PingFang TC, Heiti TC, sans-serif" font-size="200" font-weight="900" fill="#fbf6ec" text-anchor="middle" dominant-baseline="middle">釜</text>
</svg>
```

- [ ] **Step 2: 寫 `tools/make-icons.sh` 並執行**

```bash
#!/bin/bash
# 由 tools/icon.svg 產生 PWA 圖示（macOS 內建工具：qlmanage 轉檔、sips 縮放）
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p app/icons
qlmanage -t -s 512 -o app/icons tools/icon.svg >/dev/null
mv app/icons/icon.svg.png app/icons/icon-512.png
sips -z 192 192 app/icons/icon-512.png --out app/icons/icon-192.png >/dev/null
sips -z 180 180 app/icons/icon-512.png --out app/icons/apple-touch-icon.png >/dev/null
ls -la app/icons/
```

Run: `bash tools/make-icons.sh`
Expected: 三個 PNG 產生、每個 > 3KB。**若 qlmanage 轉出全白或失敗，回報 BLOCKED**（由控制者改用其他轉檔法）。

- [ ] **Step 3: 寫 `manifest.json`**

```json
{
  "name": "釜山旅遊工具",
  "short_name": "釜山工具",
  "start_url": "./app.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f4ecdd",
  "theme_color": "#16332c",
  "icons": [
    { "src": "app/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "app/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 4: 寫 `sw.js`**

```javascript
/* sw.js — app shell cache-first；GAS／跨域請求一律不攔截（離線寫入由 app/sync.js 佇列處理）
 * 改動 SHELL 內任何檔案時，必須 bump CACHE 版本（tt-vN）。 */
const CACHE = 'tt-v1';
const SHELL = [
  './app.html',
  './manifest.json',
  './app/app.css?v=3',
  './app/sync.js',
  './app/itinerary.js',
  './app/expenses.js',
  './app/phrases.js',
  './app/spots-data.js',
  './app/vendor/Sortable.min.js',
  './app/icons/icon-192.png',
  './app/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // GAS、Google Fonts 等交給網路
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
```

- [ ] **Step 5: `app.html` 三處修改**

1. `<head>` 內、stylesheet link 之前加：

```html
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="app/icons/apple-touch-icon.png">
<meta name="theme-color" content="#16332c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
```

2. bootstrap module 兩處：

（a）module 最末尾（配對 if/else 之外，**無論是否已配對都要註冊**）加：

```javascript
// Service worker（僅 https 或 localhost；GAS 請求不經 SW）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js');
}
```

（b）已配對分支內、`engine.start();` 之後加（只出現一次的安裝引導）：

```javascript
  // 加入主畫面提示（iOS 無安裝 API，只能文字引導）
  if (!localStorage.getItem('tt.a2hs') && !window.navigator.standalone) {
    localStorage.setItem('tt.a2hs', '1');
    setTimeout(() => alert('小提示：用 Safari 的「分享 → 加入主畫面」把這個工具變成 App 圖示，離線也能開。'), 800);
  }
```

3. 確認 stylesheet link 已是 `app/app.css?v=3`（Task 1 已改；若本 task 先做則在此改）。

- [ ] **Step 6: 跑測試＋本機驗證**

Run: `node --test` → 30 PASS。
本機 `http://localhost:8080/app.html`（localhost 可註冊 SW）：DevTools → Application → Service Workers 顯示 activated；Network 斷線後重新整理，app shell 仍可開（資料快取由 localStorage 供應）。

- [ ] **Step 7: Commit**

```bash
git add tools/icon.svg tools/make-icons.sh app/icons manifest.json sw.js app.html
git commit -m "feat: add pwa manifest, service worker and app icons"
```

---

### Task 3: index.html 目錄卡片＋收尾

**Files:**
- Modify: `index.html`（grid 內、照原有註解的複製模式加第三張卡片）

**Interfaces:**
- Consumes: index.html 既有 `.card` 結構與動畫（nth-child(3) 延遲已存在）

- [ ] **Step 1: 在 `index.html` 的 `<!-- ▲▲ 複製到這裡為止 ▲▲ -->` 之前插入**

```html
      <a class="card" href="app.html">
        <div class="media">
          <span class="seal">具</span>
          <span class="glyph">工具</span>
        </div>
        <div class="body">
          <p class="pos">TOOLS · 旅遊工具</p>
          <h3>行程・記帳・韓文</h3>
          <p>兩人共編的行程表與帳本，離線可用；附常用韓文短語與翻譯捷徑。</p>
          <span class="cta">打開工具 →</span>
        </div>
      </a>
```

- [ ] **Step 2: 決策記錄——spike.html 保留**

保留 `spike.html` 作為日後 GAS 連通診斷工具（無機密、不掛連結），不需修改。

- [ ] **Step 3: 本機驗證**

`http://localhost:8080/index.html`：第三張卡片出現、動畫正常、點擊進入 app.html。

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add travel tools card to index page"
```

---

### Task 4: 端對端驗收（控制者＋使用者）

- [ ] `node --test` → 30 PASS
- [ ] 韓文 tab：分類切換、卡片放大全螢幕、Papago 外連帶字、Sheet phrases 分頁加一句 → 同步後出現在對應分類最後
- [ ] PWA：localhost SW activated、離線重載 shell 可開
- [ ] index.html 卡片進入正常
- [ ] （merge 後）真機：加入主畫面 → standalone 開啟、圖示正確、離線開啟

---

## 完成後

Plan 1–3 全部完成＝spec 全範圍交付。後續：merge → Pages 部署 → 真機雙機驗收 → 10 月出發前實戰使用。
