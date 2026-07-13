# 旅遊工具 PWA — MVP 實作計畫（Plan 1/3：GAS 後端＋同步層＋記帳）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出第一個雙機可試的版本——GAS 後端、離線優先同步引擎、App 殼與配對流程、記帳 tab。

**Architecture:** 零建置多檔 PWA（vanilla JS ES modules，push 即部署 GitHub Pages）；後端為 GAS Web App + Google Sheets；前端 localStorage 本地優先＋離線佇列＋前景輪詢，record 級 last-write-wins。詳見 spec：`docs/superpowers/specs/2026-07-13-pwa-travel-tools-design.md`。

**Tech Stack:** Vanilla JS（ES modules）、Google Apps Script、node:test（dev only）。無框架、無建置工具、無 runtime 依賴。

**本計畫範圍：** spec 里程碑 1–2（spike＋同步骨架＋記帳 MVP）。行程 tab（Plan 2）、韓文 tab＋manifest/sw＋index 卡片（Plan 3）不在本計畫。

## Global Constraints

- 零建置：不引入 npm 套件與 build step；`tests/` 只用 Node 內建 `node:test`（需 Node 20+，僅開發用）。
- 全部前端檔案用相對路徑（GitHub Pages 專案路徑 `/Ch/` 下必須正常）。
- POST 一律 `Content-Type: text/plain;charset=utf-8`（避開 GAS CORS preflight）；push 批次上限 50 筆。
- localStorage keys 一律 `tt.` 前綴：`tt.data`、`tt.queue`、`tt.lastSync`、`tt.pair`、`tt.tab`。
- GAS 網址與 token 絕不進 repo（repo 為 public）；token 存 GAS Script Properties。
- UI 文案為繁體中文；配色沿用 hanji `#f4ecdd`／card `#fbf6ec`／pine `#16332c`／brass `#bf962f`／vermilion `#b23528`／line `#e2d4bd`；字體 Noto Sans TC＋Noto Serif TC。
- 衝突策略：record 級 last-write-wins（updatedAt 以伺服器時間為準）；刪除＝軟刪除 `deleted:1`。
- 記帳分類固定：餐飲🍜／交通🚇／購物🛍️／票券🎡／住宿🏨／其他✨。
- 幣別統計規則：一律折算 TWD 加總（KRW×匯率＋TWD），單筆顯示原幣＋約值；匯率存 settings `exchangeRate`（TWD per 1 KRW，預設 0.023）。
- Commit 一律走 Conventional Commits、不加 scope 括號、不加 Co-Authored-By。

---

### Task 1: GAS 後端（Code.gs）＋部署指南＋spike 驗證頁

**Files:**
- Create: `gas/Code.gs`
- Create: `gas/DEPLOY.md`
- Create: `spike.html`

**Interfaces:**
- Produces（後續所有前端依賴的 API 契約）:
  - `GET ?action=pull&since=<ms>&token=<t>` → `{serverTime:number, itinerary:[], expenses:[], phrases:[], settings:{key:value}}`（itinerary/expenses 只回 `updatedAt > since`；phrases/settings 全量）
  - `POST text/plain body: {"token":string,"ops":[{"tab":string,"record":object}]}` → `{serverTime:number, applied:[key]}`
  - token 錯誤時兩者皆回 `{"error":"unauthorized"}`（HTTP 200 包裝）
  - 主鍵：itinerary/expenses=`id`、settings=`key`、phrases 唯讀不接受 push

- [ ] **Step 1: 寫 `gas/Code.gs`（完整後端）**

```javascript
/* 旅遊工具 PWA 後端 — Google Apps Script
 * 部署：Web App / Execute as me / Anyone。token 存 Script Properties（key: TOKEN）。
 * 詳見 gas/DEPLOY.md。
 */
const SHEET_TABS = {
  itinerary: ['id','day','time','title','spotId','note','sortOrder','done','updatedAt','deleted'],
  expenses:  ['id','date','title','category','amount','currency','updatedAt','deleted'],
  phrases:   ['category','zh','ko','roman'],
  settings:  ['key','value'],
};

/* 首次執行一次：建立四個分頁與表頭，並把全表設為純文字格式
 * （避免 Sheets 把 2026-10-24 自動轉成 Date、pull 回來變 ISO 字串） */
function setup() {
  Object.keys(SHEET_TABS).forEach(function (name) {
    const sh = sheet_(name);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  });
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!checkToken_(p.token)) return json_({ error: 'unauthorized' });
  if (p.action === 'pull') return json_(pull_(Number(p.since || 0)));
  return json_({ error: 'unknown action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad json' }); }
  if (!checkToken_(body.token)) return json_({ error: 'unauthorized' });
  const ops = (body.ops || []).slice(0, 50);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const serverTime = Date.now();
    const applied = ops.map(function (op) { return upsert_(op.tab, op.record, serverTime); })
                       .filter(function (k) { return k !== null; });
    return json_({ serverTime: serverTime, applied: applied });
  } finally {
    lock.releaseLock();
  }
}

function pull_(since) {
  const out = { serverTime: Date.now() };
  ['itinerary', 'expenses'].forEach(function (name) {
    out[name] = readRows_(name).filter(function (r) { return Number(r.updatedAt) > since; });
  });
  out.phrases = readRows_('phrases');
  out.settings = {};
  readRows_('settings').forEach(function (r) { out.settings[r.key] = r.value; });
  return out;
}

function upsert_(tab, record, serverTime) {
  if (tab !== 'itinerary' && tab !== 'expenses' && tab !== 'settings') return null; // phrases 唯讀
  const keyField = tab === 'settings' ? 'key' : 'id';
  const keyVal = record && record[keyField];
  if (!keyVal) return null;
  if (tab !== 'settings') record.updatedAt = serverTime; // settings 無 updatedAt 欄
  const sh = sheet_(tab);
  const header = SHEET_TABS[tab];
  const last = sh.getLastRow();
  let rowIdx = -1;
  if (last >= 2) {
    const keys = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === String(keyVal)) { rowIdx = i + 2; break; }
    }
  }
  const rowData = header.map(function (h) { return record[h] !== undefined ? record[h] : ''; });
  if (rowIdx === -1) sh.appendRow(rowData);
  else sh.getRange(rowIdx, 1, 1, header.length).setValues([rowData]);
  return keyVal;
}

function readRows_(name) {
  const sh = sheet_(name);
  if (sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const header = SHEET_TABS[name];
  return values.slice(1).map(function (row) {
    const rec = {};
    header.forEach(function (h, i) { rec[h] = row[i]; });
    return rec;
  }).filter(function (r) { return String(r[header[0]]) !== ''; });
}

/* 人工直接改 Sheet 時自動蓋新 updatedAt，讓手改也能同步下行 */
function onEdit(e) {
  const sh = e.range.getSheet();
  const name = sh.getName();
  if (name !== 'itinerary' && name !== 'expenses') return;
  const row = e.range.getRow();
  if (row < 2) return;
  const col = SHEET_TABS[name].indexOf('updatedAt') + 1;
  if (e.range.getColumn() === col) return; // 避免自我觸發
  sh.getRange(row, col).setValue(Date.now());
}

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return Boolean(expected) && token === expected;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(SHEET_TABS[name]); }
  return sh;
}
```

- [ ] **Step 2: 寫 `gas/DEPLOY.md`（使用者照做的部署步驟）**

```markdown
# GAS 部署步驟（約 10 分鐘，用 Joey 的 Google 帳號）

1. 到 https://sheets.new 建一份新試算表，命名「釜山旅遊工具」。
2. 選單「擴充功能 → Apps Script」，刪掉預設內容，貼上 repo 的 `gas/Code.gs` 全文，存檔。
3. 左側「專案設定（齒輪）→ 指令碼屬性 → 新增指令碼屬性」：
   - 屬性：`TOKEN`；值：自訂一串亂碼（例如 `openssl rand -hex 16` 的輸出）。
4. 回編輯器，上方函式選 `setup` → 執行一次（授權走完）→ 回試算表確認出現
   itinerary / expenses / phrases / settings 四個分頁與表頭。
5. 「部署 → 新增部署作業 → 類型：網頁應用程式」：
   - 執行身分：我；具有存取權的使用者：所有人 → 部署 → 複製 Web App URL（.../exec 結尾）。
6. 驗證（把 URL 與 TOKEN 換成你的）：
   curl -sL "<URL>?action=pull&since=0&token=<TOKEN>"
   → 應回 {"serverTime":...,"itinerary":[],"expenses":[],"phrases":[],"settings":{}}
   curl -sL -H "Content-Type: text/plain" -d '{"token":"<TOKEN>","ops":[{"tab":"expenses","record":{"id":"t1","date":"2026-10-22","title":"測試","category":"餐飲","amount":1000,"currency":"KRW","deleted":0}}]}' "<URL>"
   → 應回 {"serverTime":...,"applied":["t1"]}，且 Sheet expenses 分頁出現一列。
7. 錯誤 token 驗證：把 token 改錯重打步驟 6 第一條 → 應回 {"error":"unauthorized"}。
8. 之後若改了 Code.gs：「部署 → 管理部署作業 → 編輯 → 版本：新版本」（URL 不變）。
```

- [ ] **Step 3: 寫 `spike.html`（瀏覽器端連通驗證頁，含配對碼產生器）**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GAS 連通測試</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;background:#f4ecdd;color:#23170f}
  input{width:100%;box-sizing:border-box;padding:8px;margin:4px 0 12px;border:1px solid #e2d4bd;border-radius:8px}
  button{padding:10px 16px;margin:0 8px 8px 0;border:0;border-radius:8px;background:#16332c;color:#f4ecdd;font-weight:700}
  pre{background:#fbf6ec;border:1px solid #e2d4bd;border-radius:8px;padding:12px;white-space:pre-wrap;word-break:break-all}
</style>
</head>
<body>
<h1>GAS 連通測試</h1>
<label>GAS Web App URL（.../exec）</label><input id="url" placeholder="https://script.google.com/macros/s/.../exec">
<label>TOKEN</label><input id="token">
<button id="pull">1. 測試 pull</button>
<button id="push">2. 測試 push</button>
<button id="pair">3. 產生配對碼</button>
<pre id="log">結果會顯示在這裡</pre>
<script>
const $ = id => document.getElementById(id);
const log = v => { $('log').textContent = typeof v === 'string' ? v : JSON.stringify(v, null, 2); };
$('pull').onclick = async () => {
  try {
    const r = await fetch(`${$('url').value}?action=pull&since=0&token=${encodeURIComponent($('token').value)}`);
    log(await r.json());
  } catch (e) { log('FAIL: ' + e.message); }
};
$('push').onclick = async () => {
  try {
    const body = JSON.stringify({ token: $('token').value, ops: [{ tab: 'expenses', record: {
      id: 'spike-' + Date.now(), date: '2026-10-22', title: 'spike 測試', category: '其他',
      amount: 100, currency: 'KRW', deleted: 0 } }] });
    const r = await fetch($('url').value, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    log(await r.json());
  } catch (e) { log('FAIL: ' + e.message); }
};
$('pair').onclick = () => log(btoa(JSON.stringify({ url: $('url').value, token: $('token').value })));
</script>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add gas/Code.gs gas/DEPLOY.md spike.html
git commit -m "feat: add GAS backend, deploy guide and spike page"
```

- [ ] **Step 5:（使用者操作）依 `gas/DEPLOY.md` 部署並跑完步驟 6–7 的 curl 驗證**

Expected: pull 回空集合 JSON；push 回 `applied:["t1"]`；錯誤 token 回 `unauthorized`。
之後 push 本分支到 GitHub 讓 Pages 提供 `spike.html`，手機 Safari 開啟再驗一次（確認 CORS／302 在真實 origin 沒問題）。
**此步未全數通過前，不進 Task 2**（spec Step 0 風險閘門）。

---

### Task 2: sync.js 純函式（配對碼、LWW 合併、記憶體儲存）

**Files:**
- Create: `app/sync.js`
- Create: `tests/sync.test.mjs`

**Interfaces:**
- Produces:
  - `LS = {data:'tt.data', queue:'tt.queue', lastSync:'tt.lastSync', pair:'tt.pair', tab:'tt.tab'}`
  - `encodePairCode(url:string, token:string): string`
  - `decodePairCode(code:string): {url,token} | null`
  - `memStorage(): {getItem,setItem,removeItem}`
  - `mergeServerRecords(local:Object, serverRecords:Array, pendingKeys:Set, keyField='id'): Object`

- [ ] **Step 1: 寫失敗測試 `tests/sync.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePairCode, decodePairCode, mergeServerRecords, memStorage } from '../app/sync.js';

test('配對碼 roundtrip', () => {
  const code = encodePairCode('https://script.google.com/macros/s/x/exec', 'secret123');
  assert.deepEqual(decodePairCode(code), { url: 'https://script.google.com/macros/s/x/exec', token: 'secret123' });
});

test('配對碼非法輸入回 null', () => {
  assert.equal(decodePairCode('not-base64!!'), null);
  assert.equal(decodePairCode(btoa(JSON.stringify({ url: 'http://insecure', token: 'x' }))), null);
  assert.equal(decodePairCode(btoa(JSON.stringify({ url: 'https://ok' }))), null);
});

test('merge：伺服器較新覆蓋、本地較新保留、pending 跳過', () => {
  const local = {
    a: { id: 'a', title: '舊', updatedAt: 100 },
    b: { id: 'b', title: '本地新', updatedAt: 900 },
    c: { id: 'c', title: '排隊中', updatedAt: 100 },
  };
  const server = [
    { id: 'a', title: '伺服器新', updatedAt: 500 },
    { id: 'b', title: '伺服器舊', updatedAt: 500 },
    { id: 'c', title: '伺服器版', updatedAt: 500 },
    { id: 'd', title: '新增', updatedAt: 500 },
  ];
  const out = mergeServerRecords(local, server, new Set(['c']), 'id');
  assert.equal(out.a.title, '伺服器新');
  assert.equal(out.b.title, '本地新');
  assert.equal(out.c.title, '排隊中');
  assert.equal(out.d.title, '新增');
});

test('memStorage 行為同 localStorage 介面', () => {
  const s = memStorage();
  assert.equal(s.getItem('x'), null);
  s.setItem('x', '1');
  assert.equal(s.getItem('x'), '1');
  s.removeItem('x');
  assert.equal(s.getItem('x'), null);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/`
Expected: FAIL（`Cannot find module '../app/sync.js'`）

- [ ] **Step 3: 寫 `app/sync.js`（本 Task 只含純函式部分）**

```javascript
/* app/sync.js — 本地優先資料層：localStorage 快取＋離線佇列＋GAS 輪詢 */

export const LS = { data: 'tt.data', queue: 'tt.queue', lastSync: 'tt.lastSync', pair: 'tt.pair', tab: 'tt.tab' };

export function encodePairCode(url, token) { return btoa(JSON.stringify({ url, token })); }

export function decodePairCode(code) {
  try {
    const o = JSON.parse(atob(String(code).trim()));
    if (typeof o.url === 'string' && o.url.startsWith('https://') &&
        typeof o.token === 'string' && o.token.length > 0) {
      return { url: o.url, token: o.token };
    }
  } catch (_) { /* 非法輸入 */ }
  return null;
}

export function memStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

/* record 級 last-write-wins；pendingKeys（尚未送出的本地變更）優先 */
export function mergeServerRecords(local, serverRecords, pendingKeys, keyField = 'id') {
  const out = { ...local };
  for (const rec of serverRecords || []) {
    const k = rec[keyField];
    if (k === undefined || k === '') continue;
    if (pendingKeys.has(k)) continue;
    const cur = out[k];
    if (!cur || Number(rec.updatedAt || 0) >= Number(cur.updatedAt || 0)) out[k] = rec;
  }
  return out;
}
```

（Node 20 全域已有 `btoa`/`atob`，測試可直接跑。）

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test tests/`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/sync.js tests/sync.test.mjs
git commit -m "feat: add sync pure functions with pair code and LWW merge"
```

---

### Task 3: SyncEngine（離線佇列、flush 退避、pull 合併、輪詢）

**Files:**
- Modify: `app/sync.js`（附加於檔尾）
- Modify: `tests/sync.test.mjs`（附加測試）

**Interfaces:**
- Consumes: Task 2 的 `LS`、`mergeServerRecords`、`memStorage`
- Produces:
  - `gasTransport(pair:{url,token}, fetchFn=fetch): {pull(since):Promise, push(ops):Promise}`
  - `class SyncEngine`，建構參數 `{transport, storage, onChange, onStatus, pollMs=20000}`：
    - `.data = {itinerary:{}, expenses:{}, settings:{}, phrases:[]}`（settings 以 key 為鍵，值為 `{key,value}`）
    - `.upsert(tab, record)`（樂觀更新＋排隊＋觸發 flush）
    - `.flush(): Promise`／`.pull(): Promise`／`.syncNow(): Promise`
    - `.start(doc?)`（立即同步＋前景每 pollMs 輪詢＋visibilitychange 觸發）
    - `.pendingCount(): number`
    - `onStatus({online:boolean, pending:number, flushing:boolean, unauthorized?:true})`

- [ ] **Step 1: 附加失敗測試到 `tests/sync.test.mjs`**

```javascript
import { SyncEngine } from '../app/sync.js';

function fakeTransport() {
  const calls = { push: [], pull: [] };
  const t = {
    calls,
    failPush: false,
    pullResponse: { serverTime: 1000, itinerary: [], expenses: [], phrases: [], settings: {} },
    async push(ops) {
      calls.push.push(ops);
      if (t.failPush) throw new Error('network');
      return { serverTime: 1000, applied: ops.map(o => o.record.id || o.record.key) };
    },
    async pull(since) { calls.pull.push(since); return t.pullResponse; },
  };
  return t;
}
const makeEngine = t => new SyncEngine({ transport: t, storage: memStorage(), pollMs: 999999 });

test('upsert 樂觀更新並去重排隊', () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  e.flushing = true; // 暫停 flush，確定性地觀察佇列去重
  e.upsert('expenses', { id: 'x1', title: 'v1', amount: 100, updatedAt: 1 });
  e.upsert('expenses', { id: 'x1', title: 'v2', amount: 200, updatedAt: 2 });
  assert.equal(e.data.expenses.x1.title, 'v2');
  assert.equal(e.pendingCount(), 1); // 同 id 只留最新一筆
  assert.equal(e.queue[0].record.title, 'v2');
});

test('flush 成功清空佇列、失敗保留佇列', async () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  e.flushing = true;
  e.upsert('expenses', { id: 'x1', title: 'a', updatedAt: 1 });
  e.flushing = false;
  t.failPush = true;
  await e.flush();
  assert.equal(e.pendingCount(), 1);
  clearTimeout(e.retryTimer);
  t.failPush = false;
  await e.flush();
  assert.equal(e.pendingCount(), 0);
  assert.equal(t.calls.push.length, 2);
});

test('pull 合併伺服器資料、pending 記錄不被覆蓋、lastSync 前進', async () => {
  const t = fakeTransport();
  const e = makeEngine(t);
  e.flushing = true; // p1 留在佇列，模擬尚未送出
  e.upsert('expenses', { id: 'p1', title: '本地排隊', updatedAt: 1 });
  t.pullResponse = {
    serverTime: 2000,
    itinerary: [],
    expenses: [
      { id: 'p1', title: '伺服器版', updatedAt: 1500 },
      { id: 's1', title: '別機新增', updatedAt: 1500 },
    ],
    phrases: [{ category: '點餐', zh: '你好', ko: '안녕하세요', roman: 'annyeonghaseyo' }],
    settings: { exchangeRate: '0.024' },
  };
  await e.pull();
  assert.equal(e.data.expenses.p1.title, '本地排隊');
  assert.equal(e.data.expenses.s1.title, '別機新增');
  assert.equal(e.data.settings.exchangeRate.value, '0.024');
  assert.equal(e.data.phrases.length, 1);
  assert.equal(e.lastSync, 2000);
});

test('unauthorized 透過 onStatus 通報', async () => {
  const statuses = [];
  const t = fakeTransport();
  t.pull = async () => { throw new Error('unauthorized'); };
  const e = new SyncEngine({ transport: t, storage: memStorage(), onStatus: s => statuses.push(s), pollMs: 999999 });
  await e.pull();
  assert.equal(statuses.some(s => s.unauthorized === true), true);
});

test('資料與佇列持久化到 storage 並可重建', async () => {
  const s = memStorage();
  const t = fakeTransport();
  const e1 = new SyncEngine({ transport: t, storage: s, pollMs: 999999 });
  e1.flushing = true; // 不送出，驗證持久化
  e1.upsert('expenses', { id: 'k1', title: '存起來', updatedAt: 1 });
  const e2 = new SyncEngine({ transport: t, storage: s, pollMs: 999999 });
  assert.equal(e2.data.expenses.k1.title, '存起來');
  assert.equal(e2.pendingCount(), 1);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/`
Expected: 前 4 個 PASS，新增 5 個 FAIL（`SyncEngine` 未定義）

- [ ] **Step 3: 在 `app/sync.js` 檔尾實作 transport 與 SyncEngine**

```javascript
export function gasTransport(pair, fetchFn = fetch) {
  return {
    async pull(since) {
      const res = await fetchFn(`${pair.url}?action=pull&since=${since}&token=${encodeURIComponent(pair.token)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    async push(ops) {
      const res = await fetchFn(pair.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: pair.token, ops }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  };
}

const keyFieldOf = tab => (tab === 'settings' ? 'key' : 'id');

export class SyncEngine {
  constructor({ transport, storage, onChange = () => {}, onStatus = () => {}, pollMs = 20000 }) {
    this.transport = transport;
    this.storage = storage;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.pollMs = pollMs;
    this.data = { itinerary: {}, expenses: {}, settings: {}, phrases: [] };
    this.queue = [];        // 待送 ops
    this.inFlight = [];     // 送出中 ops（失敗會放回 queue 前端）
    this.lastSync = 0;
    this.attempt = 0;
    this.flushing = false;
    this.online = true;
    this.timer = null;
    this.retryTimer = null;
    this.load_();
  }
  load_() {
    try { const d = JSON.parse(this.storage.getItem(LS.data)); if (d) this.data = d; } catch (_) {}
    try { const q = JSON.parse(this.storage.getItem(LS.queue)); if (Array.isArray(q)) this.queue = q; } catch (_) {}
    this.lastSync = Number(this.storage.getItem(LS.lastSync) || 0);
  }
  save_() {
    this.storage.setItem(LS.data, JSON.stringify(this.data));
    this.storage.setItem(LS.queue, JSON.stringify(this.inFlight.concat(this.queue)));
    this.storage.setItem(LS.lastSync, String(this.lastSync));
  }
  pendingKeys_(tab) {
    const kf = keyFieldOf(tab);
    const s = new Set();
    for (const op of this.inFlight.concat(this.queue)) if (op.tab === tab) s.add(op.record[kf]);
    return s;
  }
  pendingCount() { return this.inFlight.length + this.queue.length; }
  status_(extra) {
    this.onStatus(Object.assign({ online: this.online, pending: this.pendingCount(), flushing: this.flushing }, extra));
  }
  /* 樂觀更新：立即改本地、去重排隊、觸發背景 flush */
  upsert(tab, record) {
    const kf = keyFieldOf(tab);
    const k = record[kf];
    this.data[tab] = { ...this.data[tab], [k]: record };
    this.queue = this.queue.filter(op => !(op.tab === tab && op.record[kf] === k));
    this.queue.push({ tab, record });
    this.save_();
    this.onChange();
    this.status_();
    this.flush();
  }
  async flush() {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    this.status_();
    this.inFlight = this.queue.splice(0, 50);
    try {
      await this.transport.push(this.inFlight);
      this.inFlight = [];
      this.attempt = 0;
      this.online = true;
    } catch (err) {
      this.queue = this.inFlight.concat(this.queue);
      this.inFlight = [];
      this.online = false;
      this.attempt += 1;
      const delay = Math.min(1000 * Math.pow(4, this.attempt - 1), 16000); // 1s/4s/16s
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.flush(), delay);
      if (String(err.message) === 'unauthorized') this.status_({ unauthorized: true });
    } finally {
      this.flushing = false;
      this.save_();
      this.status_();
      if (this.online && this.queue.length > 0) this.flush(); // 佇列還有就續送
    }
  }
  async pull() {
    try {
      const resp = await this.transport.pull(this.lastSync);
      this.online = true;
      for (const tab of ['itinerary', 'expenses']) {
        this.data[tab] = mergeServerRecords(this.data[tab], resp[tab], this.pendingKeys_(tab), 'id');
      }
      const settingsRecs = Object.entries(resp.settings || {}).map(([key, value]) => ({ key, value }));
      this.data.settings = mergeServerRecords(this.data.settings, settingsRecs, this.pendingKeys_('settings'), 'key');
      if (Array.isArray(resp.phrases) && resp.phrases.length > 0) this.data.phrases = resp.phrases;
      this.lastSync = Number(resp.serverTime || this.lastSync);
      this.save_();
      this.onChange();
    } catch (err) {
      this.online = false;
      if (String(err.message) === 'unauthorized') { this.status_({ unauthorized: true }); return; }
    }
    this.status_();
  }
  async syncNow() { await this.flush(); await this.pull(); }
  start(doc = (typeof document === 'undefined' ? null : document)) {
    this.syncNow();
    this.timer = setInterval(() => {
      if (!doc || doc.visibilityState === 'visible') this.syncNow();
    }, this.pollMs);
    if (doc) doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') this.syncNow();
    });
  }
}
```

- [ ] **Step 4: 跑測試確認全部通過**

Run: `node --test tests/`
Expected: 9 tests PASS，且程序正常結束（測試內已 `clearTimeout(e.retryTimer)` 清掉退避計時器）

- [ ] **Step 5: Commit**

```bash
git add app/sync.js tests/sync.test.mjs
git commit -m "feat: add SyncEngine with offline queue, backoff and polling"
```

---

### Task 4: App 殼（app.html＋app.css）：配對畫面、狀態列、tab 導航

**Files:**
- Create: `app.html`
- Create: `app/app.css`

**Interfaces:**
- Consumes: Task 2/3 的 `SyncEngine`、`gasTransport`、`decodePairCode`、`LS`
- Produces:
  - `app.html` 內建 bootstrap module：建立 engine、依 `tt.pair` 切換配對畫面／主畫面、hash 路由（`#expenses`／`#itinerary`／`#phrases`，記憶於 `tt.tab`）
  - 全域容器：`#tab-content`（各 tab 的 render 目標）、`window` 不掛任何全域（模組內部傳遞）
  - 待 Task 5 使用的掛載約定：`renderExpenses(el, engine)`（expenses.js 匯出）

- [ ] **Step 1: 寫 `app/app.css`**

```css
/* 旅遊工具 PWA — 沿用韓紙配色 */
:root{
  --ink:#23170f; --ink-soft:#5a4a3c; --hanji:#f4ecdd; --card:#fbf6ec;
  --pine:#16332c; --celadon:#3c6a5d; --brass:#bf962f; --vermilion:#b23528; --line:#e2d4bd;
}
*{box-sizing:border-box}
body{margin:0;font-family:"Noto Sans TC",system-ui,sans-serif;background:var(--hanji);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:"Noto Serif TC",serif}
button{font-family:inherit}

/* 頂部列 */
.topbar{position:sticky;top:0;z-index:10;background:var(--pine);color:var(--hanji);padding:10px 14px calc(10px);display:flex;align-items:center;gap:10px}
.topbar h1{font-size:1.05rem;margin:0;flex:1;letter-spacing:.05em}
.topbar .sub{font-size:.68rem;opacity:.75;display:block;font-family:"Noto Sans TC"}
.sync{font-size:.72rem;padding:4px 10px;border-radius:14px;background:rgba(244,236,221,.14);white-space:nowrap}
.sync.off{background:var(--vermilion)}
.iconbtn{background:none;border:0;color:var(--hanji);font-size:1.1rem;padding:6px;cursor:pointer}

/* 內容與底部 tab */
main{padding:14px 14px calc(74px + env(safe-area-inset-bottom,0px));max-width:640px;margin:0 auto}
.tabs{position:fixed;bottom:0;left:0;right:0;display:flex;background:var(--card);border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom,0px);z-index:10}
.tabs button{flex:1;padding:10px 0 8px;border:0;background:none;color:var(--ink-soft);font-size:.72rem;cursor:pointer}
.tabs button .e{display:block;font-size:1.25rem;margin-bottom:2px}
.tabs button.on{color:var(--pine);font-weight:700}
.tabs button.on .e{transform:scale(1.12)}

/* 卡片與表單 */
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
.field{display:block;font-size:.78rem;color:var(--ink-soft);margin:8px 0 2px}
input,select{width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;background:#fff;font-size:1rem;font-family:inherit}
.btn{display:inline-block;padding:11px 18px;border:0;border-radius:10px;background:var(--pine);color:var(--hanji);font-weight:700;font-size:.95rem;cursor:pointer}
.btn.warn{background:var(--vermilion)}
.btn.ghost{background:none;border:1.5px solid var(--pine);color:var(--pine)}
.muted{color:var(--ink-soft);font-size:.82rem}
.placeholder{text-align:center;color:var(--ink-soft);padding:56px 0}
.placeholder .e{font-size:2.2rem;display:block;margin-bottom:8px}

/* 設定彈窗 */
dialog{border:1px solid var(--line);border-radius:14px;padding:18px;max-width:420px;width:calc(100vw - 48px);background:var(--card)}
dialog::backdrop{background:rgba(35,23,15,.45)}
```

- [ ] **Step 2: 寫 `app.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>釜山旅遊工具</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700;900&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="app/app.css">
</head>
<body>

<!-- 配對畫面 -->
<div id="pair-view" hidden>
  <main>
    <div class="card" style="margin-top:40px">
      <h2 style="margin:0 0 6px">🔗 配對</h2>
      <p class="muted">貼上 Joey 給你的配對碼，之後不會再問。</p>
      <label class="field" for="pair-code">配對碼</label>
      <input id="pair-code" autocomplete="off" placeholder="eyJ1cmwiOi...">
      <p id="pair-err" class="muted" style="color:var(--vermilion)" hidden>配對碼格式不對，再確認一次。</p>
      <button class="btn" id="pair-go" style="margin-top:12px;width:100%">開始使用</button>
    </div>
  </main>
</div>

<!-- 主畫面 -->
<div id="app-view" hidden>
  <header class="topbar">
    <h1>釜山旅遊工具<span class="sub">2026.10.22 – 10.29</span></h1>
    <span class="sync" id="sync-status">…</span>
    <button class="iconbtn" id="refresh" title="手動同步">↻</button>
    <button class="iconbtn" id="settings" title="設定">⚙</button>
  </header>
  <main id="tab-content"></main>
  <nav class="tabs">
    <button data-tab="itinerary"><span class="e">📅</span>行程</button>
    <button data-tab="expenses"><span class="e">💰</span>記帳</button>
    <button data-tab="phrases"><span class="e">🇰🇷</span>韓文</button>
  </nav>
</div>

<!-- 設定 -->
<dialog id="settings-dlg">
  <h3 style="margin:0 0 10px">⚙ 設定</h3>
  <label class="field" for="rate-input">匯率（1 KRW = ? TWD，兩機共用）</label>
  <input id="rate-input" inputmode="decimal">
  <div style="display:flex;gap:10px;margin-top:14px">
    <button class="btn" id="rate-save">儲存</button>
    <button class="btn ghost" id="dlg-close">關閉</button>
  </div>
  <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
  <button class="btn warn" id="unpair">重設配對碼</button>
</dialog>

<script type="module">
import { SyncEngine, gasTransport, decodePairCode, LS } from './app/sync.js';
import { renderExpenses } from './app/expenses.js';

const $ = id => document.getElementById(id);
let engine = null;

/* ---------- 配對 ---------- */
function getPair() {
  try { return JSON.parse(localStorage.getItem(LS.pair)); } catch (_) { return null; }
}
function showPairView() {
  $('app-view').hidden = true;
  $('pair-view').hidden = false;
}
$('pair-go').onclick = () => {
  const pair = decodePairCode($('pair-code').value);
  if (!pair) { $('pair-err').hidden = false; return; }
  localStorage.setItem(LS.pair, JSON.stringify(pair));
  location.reload();
};

/* ---------- 同步狀態列 ---------- */
function renderStatus(s) {
  const el = $('sync-status');
  if (s.unauthorized) {
    localStorage.removeItem(LS.pair);
    alert('配對已失效，請重新輸入配對碼');
    location.reload();
    return;
  }
  el.classList.toggle('off', !s.online);
  el.textContent = !s.online
    ? `⚡ 離線${s.pending ? '・' + s.pending + ' 筆待送' : ''}`
    : s.flushing || s.pending ? '↻ 同步中' : '✓ 已同步';
}

/* ---------- Tab 路由 ---------- */
const TABS = {
  itinerary: el => { el.innerHTML = '<div class="placeholder"><span class="e">📅</span>行程功能建置中</div>'; },
  expenses: el => renderExpenses(el, engine),
  phrases: el => { el.innerHTML = '<div class="placeholder"><span class="e">🇰🇷</span>韓文短語建置中</div>'; },
};
function currentTab() {
  const h = location.hash.replace('#', '');
  return TABS[h] ? h : (localStorage.getItem(LS.tab) || 'expenses');
}
function renderTab() {
  const tab = currentTab();
  localStorage.setItem(LS.tab, tab);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  TABS[tab]($('tab-content'));
}
document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => { location.hash = b.dataset.tab; }; });
window.addEventListener('hashchange', renderTab);

/* ---------- 設定 ---------- */
$('settings').onclick = () => {
  const rec = engine.data.settings.exchangeRate;
  $('rate-input').value = rec ? rec.value : '0.023';
  $('settings-dlg').showModal();
};
$('dlg-close').onclick = () => $('settings-dlg').close();
$('rate-save').onclick = () => {
  const v = parseFloat($('rate-input').value);
  if (!Number.isFinite(v) || v <= 0) return;
  engine.upsert('settings', { key: 'exchangeRate', value: String(v) });
  $('settings-dlg').close();
};
$('unpair').onclick = () => {
  if (confirm('確定要重設配對碼？')) { localStorage.removeItem(LS.pair); location.reload(); }
};
$('refresh').onclick = () => engine.syncNow();

/* ---------- 啟動 ---------- */
const pair = getPair();
if (!pair) {
  showPairView();
} else {
  $('app-view').hidden = false;
  engine = new SyncEngine({
    transport: gasTransport(pair),
    storage: localStorage,
    onChange: renderTab,
    onStatus: renderStatus,
  });
  renderTab();
  engine.start();
}
</script>
</body>
</html>
```

- [ ] **Step 3: 手動驗證（本機起 server，因 ES modules 不支援 file://）**

Run: `python3 -m http.server 8080`（repo 根目錄）
打開 `http://localhost:8080/app.html`：
- 未配對 → 顯示配對畫面；亂貼 → 顯示錯誤訊息。
- 用 spike.html 產生的真配對碼貼入 → 進主畫面、狀態列顯示 ✓ 已同步（此時 expenses.js 尚不存在，console 會有 import 錯誤——先暫時把該 import 行與 `expenses:` 那行改註解驗殼，驗完還原；或直接等 Task 5 一起驗）。
- 三個 tab 可切換、重整後停在同一 tab。

- [ ] **Step 4: Commit**

```bash
git add app.html app/app.css
git commit -m "feat: add app shell with pairing, sync status and tab nav"
```

---

### Task 5: 記帳 tab（expenses.js）＋統計純函式測試

**Files:**
- Create: `app/expenses.js`
- Create: `tests/expenses.test.mjs`

**Interfaces:**
- Consumes: Task 3 `SyncEngine`（`engine.data.expenses`、`engine.data.settings`、`engine.upsert`）
- Produces:
  - `CATEGORIES = [['餐飲','🍜'],['交通','🚇'],['購物','🛍️'],['票券','🎡'],['住宿','🏨'],['其他','✨']]`
  - `todayStr(d=new Date()): 'YYYY-MM-DD'`（本地時區）
  - `toTWD(rec, rate): number`
  - `expenseTotals(records:Array, rate:number, today:string): {todayTWD, totalTWD, byCat:{分類:TWD}}`
  - `renderExpenses(el, engine): void`

- [ ] **Step 1: 寫失敗測試 `tests/expenses.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expenseTotals, toTWD, todayStr } from '../app/expenses.js';

test('toTWD：KRW 依匯率折算、TWD 原值、四捨五入', () => {
  assert.equal(toTWD({ amount: 18000, currency: 'KRW' }, 0.023), 414);
  assert.equal(toTWD({ amount: 500, currency: 'TWD' }, 0.023), 500);
});

test('expenseTotals：TWD 加總、今日小計、分類統計、排除軟刪除', () => {
  const records = [
    { id: '1', date: '2026-10-24', category: '餐飲', amount: 10000, currency: 'KRW', deleted: 0 },
    { id: '2', date: '2026-10-24', category: '交通', amount: 100, currency: 'TWD', deleted: 0 },
    { id: '3', date: '2026-10-23', category: '餐飲', amount: 20000, currency: 'KRW', deleted: 0 },
    { id: '4', date: '2026-10-24', category: '購物', amount: 99999, currency: 'KRW', deleted: 1 },
  ];
  const t = expenseTotals(records, 0.023, '2026-10-24');
  assert.equal(t.todayTWD, 230 + 100);        // 10000*0.023 + 100
  assert.equal(t.totalTWD, 230 + 100 + 460);  // + 20000*0.023
  assert.equal(t.byCat['餐飲'], 230 + 460);
  assert.equal(t.byCat['購物'], undefined);   // 軟刪除排除
});

test('todayStr 格式', () => {
  assert.match(todayStr(new Date(2026, 9, 24)), /^2026-10-24$/);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/`
Expected: 既有 9 個 PASS，新增 3 個 FAIL（模組不存在）

- [ ] **Step 3: 寫 `app/expenses.js`**

```javascript
/* app/expenses.js — 記帳 tab：快速輸入、按日清單、TWD 統計 */

export const CATEGORIES = [['餐飲','🍜'],['交通','🚇'],['購物','🛍️'],['票券','🎡'],['住宿','🏨'],['其他','✨']];
const catEmoji = c => (CATEGORIES.find(x => x[0] === c) || ['','✨'])[1];

export function todayStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function toTWD(rec, rate) {
  return Math.round(rec.currency === 'TWD' ? Number(rec.amount) : Number(rec.amount) * rate);
}

export function expenseTotals(records, rate, today) {
  const live = records.filter(r => Number(r.deleted) !== 1);
  const out = { todayTWD: 0, totalTWD: 0, byCat: {} };
  for (const r of live) {
    const twd = toTWD(r, rate);
    out.totalTWD += twd;
    if (r.date === today) out.todayTWD += twd;
    out.byCat[r.category] = (out.byCat[r.category] || 0) + twd;
  }
  return out;
}

const fmtAmt = r => (r.currency === 'TWD' ? `NT$ ${Number(r.amount).toLocaleString()}` : `₩ ${Number(r.amount).toLocaleString()}`);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const PIE_COLORS = ['#3c6a5d','#bf962f','#b23528','#c4642a','#1f4339','#7d7a6a'];
function pieCSS(byCat, total) {
  if (!total) return '';
  let acc = 0;
  const stops = CATEGORIES.filter(([c]) => byCat[c]).map(([c], i) => {
    const from = acc; acc += (byCat[c] / total) * 100;
    return `${PIE_COLORS[i % PIE_COLORS.length]} ${from.toFixed(1)}% ${acc.toFixed(1)}%`;
  });
  return `background:conic-gradient(${stops.join(',')})`;
}

export function renderExpenses(el, engine) {
  const rateRec = engine.data.settings.exchangeRate;
  const rate = Number((rateRec && rateRec.value) || 0.023);
  const today = todayStr();
  const records = Object.values(engine.data.expenses)
    .filter(r => Number(r.deleted) !== 1)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.updatedAt) - Number(a.updatedAt));
  const totals = expenseTotals(records, rate, today);

  const catChips = CATEGORIES.map(([c, e], i) =>
    `<label style="flex:1;min-width:calc(33% - 6px)"><input type="radio" name="x-cat" value="${c}" ${i === 0 ? 'checked' : ''} hidden>
     <span class="chip">${e} ${c}</span></label>`).join('');

  const byDate = {};
  for (const r of records) (byDate[r.date] = byDate[r.date] || []).push(r);
  const listHTML = Object.keys(byDate).sort().reverse().map(date => `
    <div class="muted" style="margin:14px 2px 6px;font-weight:700">${date}${date === today ? '（今天）' : ''}</div>
    ${byDate[date].map(r => `
      <div class="card xrow" data-id="${esc(r.id)}" style="display:flex;align-items:center;gap:10px;padding:11px 13px;margin-bottom:8px">
        <span style="font-size:1.25rem">${catEmoji(r.category)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${esc(r.title) || esc(r.category)}</div>
          <div class="muted">${esc(r.category)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700">${fmtAmt(r)}</div>
          ${r.currency === 'KRW' ? `<div class="muted">≈NT$ ${toTWD(r, rate).toLocaleString()}</div>` : ''}
        </div>
        <button class="iconbtn xdel" data-id="${esc(r.id)}" title="刪除" style="color:var(--vermilion)">✕</button>
      </div>`).join('')}`).join('');

  el.innerHTML = `
    <style>
      .chip{display:block;text-align:center;padding:8px 4px;border:1px solid var(--line);border-radius:9px;background:#fff;font-size:.82rem;cursor:pointer}
      input:checked + .chip{background:var(--pine);color:var(--hanji);border-color:var(--pine);font-weight:700}
      .pie{width:64px;height:64px;border-radius:50%;flex:none}
    </style>
    <form class="card" id="x-form">
      <div style="display:flex;gap:8px">
        <input id="x-amount" inputmode="decimal" placeholder="金額" required style="flex:2;font-size:1.2rem;font-weight:700">
        <select id="x-currency" style="flex:1"><option value="KRW">₩ KRW</option><option value="TWD">NT$ TWD</option></select>
      </div>
      <input id="x-title" placeholder="項目（例：豬肉湯飯）" style="margin-top:8px">
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${catChips}</div>
      <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
        <input type="date" id="x-date" value="${today}" style="flex:1">
        <button class="btn" type="submit" style="flex:1">記一筆</button>
      </div>
    </form>
    <div class="card" style="display:flex;gap:14px;align-items:center">
      <div class="pie" style="${pieCSS(totals.byCat, totals.totalTWD)}"></div>
      <div style="flex:1">
        <div class="muted">今日 <b style="color:var(--ink)">NT$ ${totals.todayTWD.toLocaleString()}</b></div>
        <div class="muted">總計 <b style="color:var(--ink);font-size:1.1rem">NT$ ${totals.totalTWD.toLocaleString()}</b></div>
        <div class="muted" style="font-size:.72rem">匯率 1 KRW = ${rate} TWD（⚙ 可改）</div>
      </div>
    </div>
    ${listHTML || '<div class="placeholder"><span class="e">💰</span>還沒有帳目，記下第一筆吧</div>'}`;

  el.querySelector('#x-form').onsubmit = ev => {
    ev.preventDefault();
    const amount = parseFloat(el.querySelector('#x-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    engine.upsert('expenses', {
      id: crypto.randomUUID(),
      date: el.querySelector('#x-date').value || today,
      title: el.querySelector('#x-title').value.trim(),
      category: el.querySelector('input[name="x-cat"]:checked').value,
      amount,
      currency: el.querySelector('#x-currency').value,
      updatedAt: Date.now(),
      deleted: 0,
    });
  };
  el.querySelectorAll('.xdel').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const rec = engine.data.expenses[btn.dataset.id];
      if (rec && confirm(`刪除「${rec.title || rec.category}」？`)) {
        engine.upsert('expenses', { ...rec, deleted: 1, updatedAt: Date.now() });
      }
    };
  });
}
```

- [ ] **Step 4: 跑測試確認全部通過**

Run: `node --test tests/`
Expected: 12 tests PASS

- [ ] **Step 5: 本機手動驗證**

Run: `python3 -m http.server 8080` → `http://localhost:8080/app.html`
- 記一筆 KRW → 立即出現在清單（樂觀更新）、統計更新、狀態列短暫「↻ 同步中」後回「✓ 已同步」。
- 開 Google Sheet expenses 分頁 → 該筆已寫入且 updatedAt 有值。
- 開第二個無痕視窗貼同一配對碼 → 20 秒內看到同一筆。
- DevTools 切 offline → 再記一筆 → 顯示「⚡ 離線・1 筆待送」；恢復 online → 自動送出。
- 刪除一筆 → 兩視窗都消失（Sheet 該列 deleted=1）。

- [ ] **Step 6: Commit**

```bash
git add app/expenses.js tests/expenses.test.mjs
git commit -m "feat: add expenses tab with quick add, stats and soft delete"
```

---

### Task 6: 部署與雙機端對端驗收

**Files:**
- Modify: 無（部署與驗證；發現 bug 才回頭修）

**Interfaces:**
- Consumes: Task 1–5 全部產出

- [ ] **Step 1: 跑全部測試**

Run: `node --test tests/`
Expected: 12 tests PASS

- [ ] **Step 2: push 分支並合併到 main（GitHub Pages 部署源）**

依專案慣例走 PR 或直接 merge（由使用者決定）；merge 後確認
`https://joeyshen1112.github.io/Ch/app.html` 可開。

- [ ] **Step 3:（使用者操作）雙機驗收清單**

兩支 iPhone Safari 開 `.../Ch/app.html`，各自貼入配對碼（spike.html 產生），逐項打勾：
- [ ] A 機記一筆 → B 機 20 秒內出現（或按 ↻ 立即出現）
- [ ] B 機開飛航模式記 3 筆 → 顯示「⚡ 離線・3 筆待送」→ 關飛航 → A 機看到 3 筆
- [ ] 兩機幾乎同時各記一筆 → 兩筆都在、無錯誤
- [ ] A 機刪除一筆 → B 機同步後消失
- [ ] ⚙ 改匯率 → 另一機同步後統計跟著變
- [ ] 直接在 Google Sheet 改某筆金額 → 兩機同步後看到新值（onEdit trigger 生效）

- [ ] **Step 4: 驗收結果回報**

全部通過 → MVP 完成，開 Plan 2（行程 tab）。
有問題 → 記錄現象，用 systematic-debugging 處理後重跑本清單。

---

## 後續計畫（不在本文件）

- **Plan 2:** 行程 tab——日期 chips、卡片時間軸、sortOrder 拖移（vendor SortableJS）、景點庫搜尋（spots-data.js 自 busan.html 抽出）、Kakao Map 連結。
- **Plan 3:** 韓文 tab（內建短語＋Sheet 同步＋全螢幕大字＋Papago 外連）、manifest.json＋sw.js＋icons（PWA 安裝與離線殼）、index.html 目錄卡片、移除或保留 spike.html 的決定。
