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
    <div class="muted" style="margin:14px 2px 6px;font-weight:700">${esc(date)}${date === today ? '（今天）' : ''}</div>
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

  // 背景同步重繪時，保留打到一半的表單內容與焦點
  let saved = null;
  if (el.querySelector('#x-form')) {
    const active = document.activeElement;
    saved = {
      amount: el.querySelector('#x-amount').value,
      title: el.querySelector('#x-title').value,
      cat: (el.querySelector('input[name="x-cat"]:checked') || {}).value,
      currency: el.querySelector('#x-currency').value,
      date: el.querySelector('#x-date').value,
      focusId: active && el.contains(active) ? active.id : null,
    };
  }
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

  if (saved) {
    el.querySelector('#x-amount').value = saved.amount;
    el.querySelector('#x-title').value = saved.title;
    if (saved.currency) el.querySelector('#x-currency').value = saved.currency;
    if (saved.date) el.querySelector('#x-date').value = saved.date;
    const cat = saved.cat && el.querySelector('input[name="x-cat"][value="' + saved.cat + '"]');
    if (cat) cat.checked = true;
    if (saved.focusId) { const f = el.querySelector('#' + saved.focusId); if (f) f.focus(); }
  }

  el.querySelector('#x-form').onsubmit = ev => {
    ev.preventDefault();
    const amount = parseFloat(el.querySelector('#x-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const date = el.querySelector('#x-date').value || today;
    const title = el.querySelector('#x-title').value.trim();
    const category = el.querySelector('input[name="x-cat"]:checked').value;
    const currency = el.querySelector('#x-currency').value;
    el.querySelector('#x-amount').value = '';
    el.querySelector('#x-title').value = '';
    engine.upsert('expenses', {
      id: crypto.randomUUID(),
      date,
      title,
      category,
      amount,
      currency,
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
