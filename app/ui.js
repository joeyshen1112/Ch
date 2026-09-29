/* app/ui.js — 行程與記帳共用的載入狀態與骨架畫面 */

/* 首次載入的三態。lastSync > 0 代表成功同步過至少一次（localStorage 有水位），
 * 所以背景輪詢期間一律是 ready，不會每 20 秒閃一次骨架。
 * 離線且從未同步要明確回 offline，否則首次配對時沒網路會無限轉圈。 */
export function loadPhase(lastSync, online) {
  return Number(lastSync) > 0 ? 'ready' : (online ? 'loading' : 'offline');
}

export function skeletonHTML(phase, rows = 4) {
  if (phase === 'offline') {
    return '<div class="placeholder"><span class="e">⚡</span>目前離線<br><small>連上網路後會自動載入</small></div>';
  }
  const bar = w => `<span class="skbar" style="width:${w}"></span>`;
  return `<div class="skwrap" aria-busy="true" aria-label="載入中">` + Array.from({ length: rows }, (_, i) => `
    <div class="skcard">
      <div class="skhdr">${bar('26px')}${bar('42px')}</div>
      ${bar(['70%', '55%', '80%', '62%'][i % 4])}
      ${bar(['90%', '75%', '85%', '68%'][i % 4])}
    </div>`).join('') + '</div>';
}

/* 讓短暫的工作也看得見：同步常常只花 100–300ms，動畫會一閃而過。
 * sleep 可注入以便測試。work 的錯誤照常往外拋。 */
export async function withMinDuration(work, ms, sleep = m => new Promise(r => setTimeout(r, m))) {
  const [result] = await Promise.all([work(), sleep(ms)]);
  return result;
}
