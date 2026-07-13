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
   curl -sL -H "Content-Type: text/plain;charset=utf-8" -d '{"token":"<TOKEN>","ops":[{"tab":"expenses","record":{"id":"t1","date":"2026-10-22","title":"測試","category":"餐飲","amount":1000,"currency":"KRW","deleted":0}}]}' "<URL>"
   → 應回 {"serverTime":...,"applied":["t1"]}，且 Sheet expenses 分頁出現一列。
7. 錯誤 token 驗證：把 token 改錯重打步驟 6 第一條 → 應回 {"error":"unauthorized"}。
   驗證完成後，到試算表 expenses 分頁把測試列（id 為 t1 或 spike- 開頭）整列刪除，帳本才不會混入測試資料。
8. 之後若改了 Code.gs：「部署 → 管理部署作業 → 編輯 → 版本：新版本」（URL 不變）。
