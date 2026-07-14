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
  { category: '購物', zh: '我要退稅', ko: '택스 리펀 해주세요', roman: 'taek-seu ri-peon hae-ju-se-yo' },
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

/* ---------- 語音（Web Speech API；iOS 用系統韓文語音，離線可用） ---------- */
let koVoice = null;
function pickVoice_() {
  const vs = speechSynthesis.getVoices();
  koVoice = vs.find(v => v.lang === 'ko-KR') || vs.find(v => v.lang && v.lang.startsWith('ko')) || null;
}
export function speakKo(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  if (!koVoice) pickVoice_();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  if (koVoice) u.voice = koVoice;
  u.rate = 1.0; // 自然語速（偏慢會放大合成感）
  speechSynthesis.speak(u);
  return true;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window && speechSynthesis.addEventListener) {
  speechSynthesis.addEventListener('voiceschanged', pickVoice_); // iOS 語音清單為非同步載入
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
    <div class="foot muted" style="font-size:.74rem;padding:8px 2px 20px">點短語卡片會放大全螢幕並自動唸出韓文（iPhone 靜音鍵開著才會出聲）。想加句子：直接在 Google Sheet 的 phrases 分頁新增，同步後就會出現。</div>
    <div id="p-big" hidden>
      <div class="p-big-ko"></div>
      <div class="p-big-zh"></div>
      <button id="p-big-speak" class="btn" type="button" style="margin-top:26px">🔊 再聽一次</button>
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
    speakKo(p.ko); // 開啟即自動唸一次
  });
  big.querySelector('#p-big-speak').onclick = ev => {
    ev.stopPropagation();
    speakKo(big.querySelector('.p-big-ko').textContent);
  };
  big.onclick = () => {
    big.hidden = true;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  };
}
