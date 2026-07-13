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

/* 人工直接改 Sheet 時自動蓋新 updatedAt，讓手改也能同步下行（支援多列貼上/填滿） */
function onEdit(e) {
  const sh = e.range.getSheet();
  const name = sh.getName();
  if (name !== 'itinerary' && name !== 'expenses') return;
  const col = SHEET_TABS[name].indexOf('updatedAt') + 1;
  const startCol = e.range.getColumn();
  const endCol = startCol + e.range.getNumColumns() - 1;
  if (startCol === col && endCol === col) return; // 只動 updatedAt 欄本身，避免手動改時間又被蓋掉
  const startRow = Math.max(e.range.getRow(), 2); // 跳過表頭
  const endRow = e.range.getRow() + e.range.getNumRows() - 1;
  if (endRow < startRow) return;
  const now = Date.now();
  const numRows = endRow - startRow + 1;
  const vals = [];
  for (let i = 0; i < numRows; i++) vals.push([now]);
  sh.getRange(startRow, col, numRows, 1).setValues(vals);
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
