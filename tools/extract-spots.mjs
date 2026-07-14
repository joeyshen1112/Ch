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
