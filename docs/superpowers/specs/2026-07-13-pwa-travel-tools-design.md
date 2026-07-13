# 旅遊工具 PWA 設計文件（行程共編・記帳・常用韓文）

日期：2026-07-13
狀態：已與使用者逐段確認核准

## 1. 背景與目標

現有 repo 是零依賴靜態旅遊網站（`index.html` 目錄頁、`busan.html` 互動地圖、`gyeongju.html` 方案比較），部署於 GitHub Pages（public repo）。本案新增一個 PWA「旅遊工具」，供兩人（Joey 與女友，皆 iPhone）在 2026/10/22–10/29 釜山行前與行中使用。

三個功能：

1. **排行程（共編）**：每日時間軸卡片，可從景點庫帶入或自由輸入，長按拖移重排。
2. **記帳（共編）**：共同帳本（不分帳、不設預算），分類統計、KRW/TWD 換算。
3. **常用韓文**：分類短語表＋全螢幕大字模式，自由輸入外連 Papago。

### 成功標準

- 10/22 前雙機可用；兩機共編：一機寫入，另一機 20 秒內看到。
- 記一筆帳 3 秒內完成。
- 離線可讀可寫（寫入排隊），恢復網路自動同步。
- 硬性檢查點：**8/31 前雙機同步穩定**，否則降級簡化（輪詢改手動刷新）保底。

### 已定案的方向性決策（背景）

- PWA 而非原生 App：免 $99 開發者帳號與簽名效期問題，丟網址即用。
- 後端用 GAS（Google Apps Script）+ Google Sheets 而非 Firebase：使用者熟悉 GAS、零成本，且 Sheet 本身就是免費後台（可直接看帳、拉圖表）。

## 2. 整體架構

零建置多檔 PWA（vanilla JS，無框架、無 build step，push 即部署），與現有 repo 手工風格一致。

```
/app.html            PWA 入口（殼＋hash 路由 tab 導航）
/app/
  sync.js            本地優先資料層＋離線佇列＋GAS 輪詢（全案核心）
  itinerary.js       行程 tab
  expenses.js        記帳 tab
  phrases.js         韓文 tab（含內建預設短語 40–60 句）
  spots-data.js      從 busan.html DISTRICTS 抽出的景點庫（90+ 景點）
  app.css            沿用 hanji/pine/brass 配色與 Noto Serif TC
  vendor/Sortable.min.js   SortableJS 1.15.x（MIT，行動端拖移；repo 已有內嵌 Leaflet 先例）
  icons/             icon-192.png / icon-512.png / apple-touch-icon.png
/manifest.json       standalone、相對路徑（GitHub Pages 專案路徑 /Ch/）
/sw.js               service worker（app shell cache-first）
/gas/Code.gs         GAS 後端原始碼（無機密，token 存 Script Properties，可進 repo 版控）
/tests/sync.test.mjs node:test 單元測試（dev only，不影響部署）
```

`index.html` 目錄新增第三張卡片「旅遊工具」連到 `app.html`。

## 3. 資料模型（Google Sheet，一份試算表四個分頁）

```
itinerary:  id | day(2026-10-24) | time(HH:mm, 選填) | title | spotId(選填) | note | sortOrder(浮點) | done(0/1) | updatedAt(ms) | deleted(0/1)
expenses:   id | date | title | category | amount | currency(KRW/TWD) | updatedAt | deleted
phrases:    category | zh | ko | roman          ← 直接在 Sheet 維護，App 唯讀同步
settings:   key | value                          ← exchangeRate(TWD per 1 KRW)、tripStart、tripEnd、tripTitle
```

- **id 由前端產生**（`crypto.randomUUID()`），離線新增不依賴伺服器。
- **updatedAt 一律由 GAS 蓋伺服器時間**（兩機時鐘不可信），增量拉取與衝突判定均以此為準。
- **軟刪除**（deleted=1），刪除才能同步到另一機。
- **sortOrder 決定當日順序**（拖移排序的真相來源）；time 僅為卡片上的選填標籤。新增時若有填時間，初始 sortOrder 按時間插入；未填時間排至當日最後；之後以手動拖移為準。
- 行程天數由 settings 起訖日產生，改兩個值即可重用於未來旅行。
- 記帳分類固定六種：餐飲、交通、購物、票券、住宿、其他。
- phrases 顯示規則：App 內建預設清單與 Sheet 列**聯集顯示**（各分類內先內建、後 Sheet 附加）；不做去重，重複句直接在 Sheet 修正。

## 4. GAS API

Web App 部署：execute as me（Joey 的 Google 帳號）／anyone 可存取。token 存 GAS Script Properties，不出現在任何程式碼。

```
GET  ?action=pull&since=<ms>&token=<t>
  → 200 { serverTime, itinerary:[...], expenses:[...], phrases:[...], settings:{...} }
    只回傳 updatedAt > since 的列（phrases/settings 全量，量小）；首次 since=0 全量。

POST body 為 text/plain 的 JSON 字串：{"token":"...","ops":[{"tab":"expenses","record":{...}},...]}
  → LockService.getScriptLock() 包住 → 依 id upsert（無則新增列）→ 蓋 updatedAt=serverTime
  → 200 { serverTime, applied:[ids] }
  批次上限 50 筆（防呆）。
  主鍵規則：itinerary/expenses 以 id upsert；settings 以 key upsert；phrases 唯讀、不接受 push。

token 錯誤 → 回 {error:"unauthorized"}（HTTP 200 包裝，GAS 限制），前端視同 401。
```

已知 GAS 坑的對策：

1. **CORS preflight**：GAS 不處理 OPTIONS，POST 一律用 `text/plain` body（simple request 不觸發 preflight）。GET/POST 皆會經 302 轉址至 `script.googleusercontent.com`，fetch 預設跟隨即可——**此二事項為 Step 0 spike 驗證標的**。
2. **併發寫入**：全部寫入包在 LockService，兩人同送不會寫壞 Sheet。
3. **onEdit trigger**（約 10 行）：人工直接在 Sheet 改 itinerary/expenses 資料列時，自動蓋新該列 updatedAt，讓手改也能同步下行。

## 5. 前端同步層（sync.js）

```
寫入路徑：UI → 立即更新 localStorage 資料＋畫面（樂觀更新）
            → op（整筆 record 的 upsert，刪除即 deleted=1 的 upsert）附加至 pendingQueue（localStorage）
            → 線上即背景 flush（批次 POST）

拉取路徑：開啟 App／visibilitychange 回前景／前景每 20 秒輪詢／頁首手動刷新鈕
            → pull(since=lastServerTime) → 逐筆合併：
               伺服器 updatedAt 較新 → 覆蓋本地
               該 record 尚在 pendingQueue → 本地版本優先（待 flush 後下次 pull 收斂）
```

- **衝突策略：record 級 last-write-wins**。衝突單位為一筆帳／一張行程卡，兩人同改同一筆機率極低，屬正確的複雜度取捨。
- **本地儲存 localStorage**（資料量數百筆級）。Sheet 為 source of truth；本地被 iOS 清除時重新全量拉取即可恢復。
- **拖移排序＝取前後卡片 sortOrder 中點**（1.0 與 2.0 之間寫 1.5），一次拖移只更新一筆記錄；相鄰間距 < 1e-6 時由前端重整該日全部 sortOrder（整數化）再推送。
- flush 失敗：指數退避（1s/4s/16s）重試，佇列持久保留。
- 頁首同步狀態列：`✓ 已同步`／`↻ 同步中`／`⚡ 離線・N 筆待送`。

## 6. 配對與安全（repo 為 public 的對策）

- GAS 網址與 token 一律不進 repo。首次開啟顯示配對畫面，貼入**配對碼**（`{url, token}` 的 base64 字串，Joey 產生一次、LINE 傳給女友），存 localStorage 後不再詢問。
- 每次請求驗 token；驗證失敗 → 前端清除同步狀態、返回配對畫面（token 輪替路徑）。
- 資料為行程與帳目，敏感度低，此防護等級足夠；不放證件號碼等敏感資料。

## 7. UI 設計

### App 殼（app.html）

- 頂部：旅程標題＋日期、同步狀態、手動刷新鈕、⚙ 設定（匯率、配對碼重設）。
- 底部 tab：📅 行程／💰 記帳／🇰🇷 韓文。hash 路由（#itinerary 等），重開記住上次 tab。
- 視覺沿用現有三頁的韓紙配色（hanji #f4ecdd、pine #16332c、brass #bf962f）與 Noto 字體。

### 📅 行程 tab

- 頂部橫向日期 chips（由 settings 起訖日產生），今天自動選中並標記。
- 當日行程為**卡片時間軸**，依 sortOrder 排序：卡片含 emoji、標題、時間標籤（選填）、備註縮寫、分區色左邊條（景點連動時）、右側拖移把手（≡）。
- **拖移**：長按把手 0.3 秒啟動（SortableJS delay 設定，避免與捲動衝突），卡片浮起讓位、放開落位，寫入新 sortOrder。拖移僅限當日內；跨天移動用編輯表單改日期。
- **新增**：底部彈出表單——時間（選填）、標題、備註；標題欄兼景點庫搜尋框，即時過濾 spots-data.js（顯示 emoji＋分區色點＋中韓文名），點選帶入名稱/座標/spotId，不選即自由文字。
- 景點連動卡片顯示 📍 → 開 Kakao Map 網頁版（`map.kakao.com/link/map/<名稱>,<lat>,<lng>`）接導航。
- 點卡片展開：編輯（標題/時間/日期/備註）／勾選完成／刪除。

### 💰 記帳 tab

- 置頂快速輸入列：金額（`inputmode=decimal` 數字鍵盤）、標題、分類 chips（🍜餐飲 🚇交通 🛍購物 🎡票券 🏨住宿 ✨其他）、幣別 KRW/TWD（預設 KRW）、日期預設今天。目標：3 秒記完一筆。
- 清單按日分組倒序；每筆顯示 `₩18,000 (≈NT$425)`，匯率取自 settings（⚙ 可改，寫回 Sheet 兩機共享）。
- 統計：今日小計、旅程總計、分類佔比（純 CSS conic-gradient 圓餅，不引圖表庫）。
- 幣別加總規則：統計一律折算為 TWD 加總（KRW 項目 × 匯率 + TWD 項目），顯示 NT$；清單單筆顯示原幣＋約值。

### 🇰🇷 韓文 tab

- 分類 chips：點餐／交通／購物／住宿／緊急。短語卡：中文＋韓文＋羅馬拼音。
- 點卡片 → **全螢幕大字韓文**（給店員看的模式）。
- 頂部自由輸入 →「開 Papago」（`papago.naver.com/?sk=zh-TW&tk=ko&st=<文字>`）。
- 內建預設清單（40–60 句）隨 App 打包，完全離線可用；Sheet phrases 分頁可持續新增。

## 8. PWA 與離線

- `manifest.json`：standalone、theme/背景色取韓紙配色、相對路徑（scope 為 GitHub Pages 專案路徑）、icons 192/512。
- `sw.js`：app shell（HTML/JS/CSS/icons/vendor）**cache-first**，快取名含版本號，改版自動汰換（skipWaiting + clients.claim）；GAS 請求 **network-only**（離線由 sync.js 佇列處理，SW 不碰資料）。
- iOS 細節：apple-touch-icon、status bar meta；配對成功後顯示一次「加入主畫面」教學。
- 離線能力矩陣：韓文短語、景點庫＝永遠可用；行程、帳本＝可讀可寫（寫入排隊）；僅同步本身需網路。

## 9. 錯誤處理

- flush 失敗：退避重試，佇列不丟；狀態列顯示離線。
- pull 到格式錯誤列：跳過該列不中斷（Sheet 手改打錯不弄掛 App）。
- token 驗證失敗：清除同步狀態，跳配對畫面。
- GAS 配額（6 分/次、30 併發）在此規模無虞；輪詢僅於 App 前景時進行以節制用量。

## 10. 測試策略

1. **Step 0 spike（最優先）**：最小 `gas/Code.gs` + 一頁測試 HTML，自 GitHub Pages origin 驗證 GET／text-plain POST／CORS／302 轉址全通。此為全案唯一未知風險，第一天拆除。
2. **單元測試**：sync.js 的合併與佇列邏輯寫成純函式（transport 可注入），`tests/sync.test.mjs` 以 node:test 執行（零依賴、dev only）。
3. **雙裝置驗收清單**：
   - A 機加行程 → B 機 20 秒內出現。
   - B 機飛航模式記 3 筆帳 → 恢復網路 → A 機看到 3 筆。
   - 兩機同時改同一筆 → 後寫者贏、無錯誤。
   - 拖移重排 → 另一機順序一致。
4. **8/31 檢查點**：雙機同步不穩即降級（輪詢→手動刷新）保底出遊可用。

## 11. 不做的事（Out of scope）

- 分帳結算、預算追蹤（記帳僅共同帳本）。
- App 內建整句翻譯（外連 Papago）。
- 跨天拖移（用編輯表單改日期；日後可加拖到日期 chip）。
- 推播通知（GAS 無伺服器推送能力）。
- 行程與 busan.html 地圖的深度整合（地圖頁維持唯讀內容頁）。
- 多旅程管理 UI（settings 改起訖日即可重用）。

## 12. 里程碑（供實作計畫展開）

1. Step 0：GAS spike 打通（7 月中）。
2. 同步骨架 + 記帳 MVP，雙機驗證（8 月中前）。
3. 行程 tab（卡片、拖移、景點庫）。
4. 韓文 tab + PWA 磨光（manifest/sw/icons/配對流程）。
5. 8/31 檢查點 → 9 月實測與緩衝 → 10/22 出發。
