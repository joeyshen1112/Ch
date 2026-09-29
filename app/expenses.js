/* app/expenses.js — 記帳 tab：快速輸入、按日清單、TWD 統計、逐筆編輯 */
import { loadPhase, skeletonHTML } from './ui.js';

export const CATEGORIES = [['餐飲','🍜'],['交通','🚇'],['購物','🛍️'],['票券','🎡'],['住宿','🏨'],['其他','✨']];
const catEmoji = c => (CATEGORIES.find(x => x[0] === c) || ['','✨'])[1];

export function todayStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function toTWD(rec, rate) {
  return Math.round(rec.currency === 'TWD' ? Number(rec.amount) : Number(rec.amount) * rate);
}

/* 付款人：值存進 Sheet，emoji 只用於顯示（辨識用） */
export const PAYERS = [['陽', '☀️'], ['淇', '7️⃣']];

export function payerLabel(p) {
  const hit = PAYERS.find(([v]) => v === p);
  return hit ? `${hit[1]} ${p}` : String(p ?? '');
}
export const PAY_METHODS = ['信用卡', '現金'];
export const UNASSIGNED = '未指定';

/* 各付款人折算 TWD 的小計；沒填付款人的歸「未指定」 */
export function payerTotals(records, rate) {
  const out = {};
  for (const r of records) {
    if (Number(r.deleted) === 1) continue;
    const key = String(r.payer || '').trim() || UNASSIGNED;
    out[key] = (out[key] || 0) + toTWD(r, rate);
  }
  return out;
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

/* 付款人記在本機（各自的手機各自預設），不進同步資料 */
const PAYER_KEY = 'tt.payer';
const lastPayer = () => { try { return localStorage.getItem(PAYER_KEY) || PAYERS[0][0]; } catch (_) { return PAYERS[0][0]; } };
const rememberPayer = p => { try { localStorage.setItem(PAYER_KEY, p); } catch (_) {} };

let expandedId = null;

const CAT_OPTS = CATEGORIES.map(([c, e]) => [c, `${e} ${c}`]);
const PAYER_OPTS = PAYERS.map(([v]) => [v, payerLabel(v)]);
const PAY_OPTS = [['信用卡', '💳 信用卡'], ['現金', '💵 現金']];

function chips(name, opts, selected) {
  return opts.map(([v, label]) =>
    `<label class="chipwrap"><input type="radio" name="${esc(name)}" value="${esc(v)}"${v === selected ? ' checked' : ''} hidden><span class="chip">${esc(label)}</span></label>`).join('');
}
const pickedIn = (scope, name) => (scope.querySelector(`input[name="${name}"]:checked`) || {}).value || '';

export function renderExpenses(el, engine) {
  const rateRec = engine.data.settings.exchangeRate;
  const rateRaw = Number(rateRec && rateRec.value);
  const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : 0.023; // Sheet 被手改壞也不會 NaN
  const today = todayStr();
  const phase = loadPhase(engine.lastSync, engine.online);
  const records = Object.values(engine.data.expenses)
    .filter(r => Number(r.deleted) !== 1)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.updatedAt) - Number(a.updatedAt));
  const totals = expenseTotals(records, rate, today);
  const byPayer = payerTotals(records, rate);

  const rowHTML = r => {
    const open = expandedId === r.id;
    const meta = [r.category, payerLabel(r.payer), r.payMethod].filter(Boolean).join(' · ');
    return `
      <div class="card xrow${open ? ' open' : ''}" data-id="${esc(r.id)}">
        <div class="xmain">
          <span class="xemoji">${catEmoji(r.category)}</span>
          <div style="flex:1;min-width:0">
            <div class="xtitle">${esc(r.title) || esc(r.category)}</div>
            <div class="xsub">${esc(meta)}</div>
          </div>
          <div style="text-align:right;flex:none">
            <div class="xamt">${fmtAmt(r)}</div>
            ${r.currency === 'KRW' ? `<div class="muted">≈NT$ ${toTWD(r, rate).toLocaleString()}</div>` : ''}
          </div>
        </div>
        ${open ? `
        <div class="xedit">
          <div style="display:flex;gap:8px">
            <input class="xe-amount" inputmode="decimal" value="${esc(r.amount)}" style="flex:2;font-size:1.1rem;font-weight:700">
            <select class="xe-currency" style="flex:1">
              <option value="KRW"${r.currency === 'KRW' ? ' selected' : ''}>₩ KRW</option>
              <option value="TWD"${r.currency === 'TWD' ? ' selected' : ''}>NT$ TWD</option>
            </select>
          </div>
          <input class="xe-title" value="${esc(r.title || '')}" placeholder="項目" style="margin-top:8px">
          <div class="chiprow">${chips('xc-' + r.id, CAT_OPTS, r.category)}</div>
          <div class="chiprow">${chips('xp-' + r.id, PAYER_OPTS, r.payer || '')}</div>
          <div class="chiprow">${chips('xm-' + r.id, PAY_OPTS, r.payMethod || '')}</div>
          <input type="date" class="xe-date" value="${esc(r.date)}" style="margin-top:8px">
          <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
            <button class="btn xe-save" type="button">儲存</button>
            <button class="btn ghost xe-cancel" type="button">取消</button>
            <button class="btn warn xe-del" type="button" style="margin-left:auto">刪除</button>
          </div>
        </div>` : ''}
      </div>`;
  };

  const byDate = {};
  for (const r of records) (byDate[r.date] = byDate[r.date] || []).push(r);
  const listHTML = Object.keys(byDate).sort().reverse().map(date => `
    <div class="muted" style="margin:14px 2px 6px;font-weight:700">${esc(date)}${date === today ? '（今天）' : ''}</div>
    ${byDate[date].map(rowHTML).join('')}`).join('');

  const payerLine = Object.keys(byPayer).length
    ? `<div class="muted" style="margin-top:2px">${Object.entries(byPayer)
        .map(([k, v]) => `${esc(payerLabel(k))} <b style="color:var(--ink)">NT$ ${v.toLocaleString()}</b>`).join('　／　')}</div>`
    : '';

  // 背景同步重繪時，保留打到一半的表單內容與焦點
  let saved = null;
  if (el.querySelector('#x-form')) {
    const active = document.activeElement;
    const f = el.querySelector('#x-form');
    saved = {
      amount: el.querySelector('#x-amount').value,
      title: el.querySelector('#x-title').value,
      cat: pickedIn(f, 'x-cat'),
      payer: pickedIn(f, 'x-payer'),
      method: pickedIn(f, 'x-method'),
      currency: el.querySelector('#x-currency').value,
      date: el.querySelector('#x-date').value,
      focusId: active && el.contains(active) ? active.id : null,
    };
  }

  el.innerHTML = `
    <form class="card" id="x-form">
      <div style="display:flex;gap:8px">
        <input id="x-amount" inputmode="decimal" placeholder="金額" required style="flex:2;font-size:1.2rem;font-weight:700">
        <select id="x-currency" style="flex:1"><option value="KRW">₩ KRW</option><option value="TWD">NT$ TWD</option></select>
      </div>
      <input id="x-title" placeholder="項目（例：豬肉湯飯）" style="margin-top:8px">
      <div class="chiprow">${chips('x-cat', CAT_OPTS, CATEGORIES[0][0])}</div>
      <div class="chiprow">${chips('x-payer', PAYER_OPTS, lastPayer())}</div>
      <div class="chiprow">${chips('x-method', PAY_OPTS, PAY_METHODS[0])}</div>
      <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
        <input type="date" id="x-date" value="${today}" style="flex:1">
        <button class="btn" type="submit" style="flex:1">記一筆</button>
      </div>
    </form>
    <div class="card" style="display:flex;gap:14px;align-items:center">
      <div class="pie" style="${pieCSS(totals.byCat, totals.totalTWD)}"></div>
      <div style="flex:1;min-width:0">
        <div class="muted">今日 <b style="color:var(--ink)">NT$ ${totals.todayTWD.toLocaleString()}</b></div>
        <div class="muted">總計 <b style="color:var(--ink);font-size:1.1rem">NT$ ${totals.totalTWD.toLocaleString()}</b></div>
        ${payerLine}
        <div class="muted" style="font-size:.72rem">匯率 1 KRW = ${rate} TWD（⚙ 可改）</div>
      </div>
    </div>
    ${phase !== 'ready' ? skeletonHTML(phase, 3)
      : (listHTML || '<div class="placeholder"><span class="e">💰</span>還沒有帳目，記下第一筆吧</div>')}`;

  if (saved) {
    el.querySelector('#x-amount').value = saved.amount;
    el.querySelector('#x-title').value = saved.title;
    if (saved.currency) el.querySelector('#x-currency').value = saved.currency;
    if (saved.date) el.querySelector('#x-date').value = saved.date;
    const f = el.querySelector('#x-form');
    for (const [name, v] of [['x-cat', saved.cat], ['x-payer', saved.payer], ['x-method', saved.method]]) {
      const hit = v && f.querySelector(`input[name="${name}"][value="${CSS.escape(v)}"]`);
      if (hit) hit.checked = true;
    }
    if (saved.focusId) { const t = el.querySelector('#' + saved.focusId); if (t) t.focus(); }
  }

  el.querySelector('#x-form').onsubmit = ev => {
    ev.preventDefault();
    const f = ev.currentTarget;
    const amount = parseFloat(el.querySelector('#x-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const payer = pickedIn(f, 'x-payer');
    rememberPayer(payer);
    const rec = {
      id: crypto.randomUUID(),
      date: el.querySelector('#x-date').value || today,
      title: el.querySelector('#x-title').value.trim(),
      category: pickedIn(f, 'x-cat'),
      amount,
      currency: el.querySelector('#x-currency').value,
      payer,
      payMethod: pickedIn(f, 'x-method'),
      updatedAt: Date.now(),
      deleted: 0,
    };
    el.querySelector('#x-amount').value = '';
    el.querySelector('#x-title').value = '';
    engine.upsert('expenses', rec);
  };

  el.querySelectorAll('.xrow').forEach(row => {
    const r = engine.data.expenses[row.dataset.id];
    if (!r) return;
    row.querySelector('.xmain').onclick = () => {
      expandedId = expandedId === r.id ? null : r.id;
      renderExpenses(el, engine);
    };
    const save = row.querySelector('.xe-save');
    if (!save) return;
    save.onclick = () => {
      const amount = parseFloat(row.querySelector('.xe-amount').value);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const payer = pickedIn(row, 'xp-' + r.id);
      if (payer) rememberPayer(payer);
      expandedId = null;
      engine.upsert('expenses', {
        ...r,
        amount,
        currency: row.querySelector('.xe-currency').value,
        title: row.querySelector('.xe-title').value.trim(),
        category: pickedIn(row, 'xc-' + r.id) || r.category,
        payer,
        payMethod: pickedIn(row, 'xm-' + r.id),
        date: row.querySelector('.xe-date').value || r.date,
        updatedAt: Date.now(),
      });
    };
    row.querySelector('.xe-cancel').onclick = () => { expandedId = null; renderExpenses(el, engine); };
    row.querySelector('.xe-del').onclick = () => {
      if (confirm(`刪除「${r.title || r.category}」？`)) {
        expandedId = null;
        engine.upsert('expenses', { ...r, deleted: 1, updatedAt: Date.now() });
      }
    };
  });
}
