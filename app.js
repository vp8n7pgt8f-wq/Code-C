'use strict';

/* =========================================================
 * 단어 3 — 작은 창에 띄워 두고 보는 영어 단어 암기 앱
 * 빌드 도구 없음. 모든 데이터는 localStorage에 저장된다.
 * ========================================================= */

const BATCH = 3;
const KEY_WORDS = 'vocab3.words';
const KEY_STATE = 'vocab3.state';

const SAMPLE_WORDS = [
  ['abundant', '풍부한'],
  ['brief', '짧은, 간단한'],
  ['consider', '고려하다'],
  ['decline', '감소하다; 거절하다'],
  ['essential', '필수적인'],
  ['frequent', '잦은, 빈번한'],
  ['generate', '만들어 내다, 발생시키다'],
  ['hesitate', '망설이다'],
  ['improve', '개선하다, 나아지다'],
  ['journey', '여행, 여정'],
];

// 0: 둘 다 보기, 1: 뜻 가리기, 2: 영어 가리기
const MODES = [
  { label: '모두 보기', hideEn: false, hideKo: false },
  { label: '뜻 가림', hideEn: false, hideKo: true },
  { label: '영어 가림', hideEn: true, hideKo: false },
];

const DEFAULT_STATE = {
  mode: 0,
  order: 'seq',        // 'seq' | 'random'
  seqPos: 0,           // 순서대로 모드에서 현재 묶음의 시작 위치
  seqStep: BATCH,      // 지난번 묶음에서 순서상 몇 칸을 썼는지
  batchNo: 0,          // 지금까지 넘긴 묶음 수 (헷갈림 단어 섞기용)
  current: [],         // 현재 화면에 있는 단어 id 3개
  theme: 'system',     // 'system' | 'light' | 'dark'
  fontScale: 1,        // 글자 크기 배율
  autoNext: 0,         // 자동 넘김 초 (0 = 끄기)
  hideKnown: true,     // 외웠음 단어를 묶음에서 뺄지
  wakeLock: false,     // 화면 꺼짐 방지
};

const HARD_WEIGHT = 3;  // 랜덤에서 헷갈림 단어가 뽑힐 가중치

/* ---------- 저장소 ---------- */

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    toast('저장 공간에 저장하지 못했습니다.');
  }
}

let words = load(KEY_WORDS, null);
let state = Object.assign({}, DEFAULT_STATE, load(KEY_STATE, {}));

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeWord(en, ko, status) {
  return { id: newId(), en, ko, status: status || 'none' };
}

function sampleWords() {
  return SAMPLE_WORDS.map(([en, ko]) => makeWord(en, ko));
}

if (!Array.isArray(words)) {
  words = sampleWords();
  save(KEY_WORDS, words);
}

const saveWords = () => save(KEY_WORDS, words);
const saveState = () => save(KEY_STATE, state);

/* ---------- 요소 ---------- */

const $ = (id) => document.getElementById(id);
const el = {
  focus: $('focus'),
  cards: $('cards'),
  modeBtn: $('modeBtn'),
  nextBtn: $('nextBtn'),
  settingsBtn: $('settingsBtn'),
  settings: $('settings'),
  closeSettingsBtn: $('closeSettingsBtn'),
  themeSeg: $('themeSeg'),
  orderSeg: $('orderSeg'),
  fontRange: $('fontRange'),
  fontValue: $('fontValue'),
  autoSeg: $('autoSeg'),
  knownSeg: $('knownSeg'),
  wakeSeg: $('wakeSeg'),
  wakeStatus: $('wakeStatus'),
  addForm: $('addForm'),
  addEn: $('addEn'),
  addKo: $('addKo'),
  bulkText: $('bulkText'),
  bulkBtn: $('bulkBtn'),
  bulkResult: $('bulkResult'),
  wordList: $('wordList'),
  wordCount: $('wordCount'),
  exportBtn: $('exportBtn'),
  importBtn: $('importBtn'),
  importFile: $('importFile'),
  backupResult: $('backupResult'),
  resetBtn: $('resetBtn'),
  toast: $('toast'),
};

/* ---------- 묶음 선택 ---------- */

// 카드에 나올 수 있는 단어 목록
function pool() {
  return state.hideKnown ? words.filter((w) => w.status !== 'known') : words;
}

function wordById(id) {
  return words.find((w) => w.id === id);
}

// 순서대로: seqPos부터 3개. 두 묶음마다 한 번은 2개만 순서대로 가져오고
// 나머지 한 자리에 헷갈림 단어를 넣는다.
function pickSequential(list) {
  const n = list.length;
  if (n <= BATCH) return { ids: list.map((w) => w.id), step: n };
  const at = (i) => list[(state.seqPos + i) % n];
  if (state.batchNo % 2 === 1) {
    const ids = [at(0).id, at(1).id];
    const hard = list.filter((w) => w.status === 'hard' && !ids.includes(w.id) && w.id !== at(2).id);
    if (hard.length) {
      ids.push(hard[Math.floor(Math.random() * hard.length)].id);
      return { ids, step: 2 };
    }
  }
  return { ids: [at(0).id, at(1).id, at(2).id], step: BATCH };
}

// 랜덤: 헷갈림 단어에 가중치를 주어 중복 없이 3개
function pickRandom(list) {
  if (list.length <= BATCH) return shuffle(list.map((w) => w.id));
  // 가능하면 지금 화면의 단어는 피한다
  let candidates = list.filter((w) => !state.current.includes(w.id));
  if (candidates.length < BATCH) candidates = list.slice();
  const ids = [];
  while (ids.length < BATCH) {
    const total = candidates.reduce((sum, w) => sum + weight(w), 0);
    let r = Math.random() * total;
    let i = 0;
    while (i < candidates.length - 1 && (r -= weight(candidates[i])) >= 0) i++;
    ids.push(candidates[i].id);
    candidates.splice(i, 1);
  }
  return ids;
}

function weight(w) {
  return w.status === 'hard' ? HARD_WEIGHT : 1;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 현재 묶음을 정한다. advance=true면 다음 묶음으로 넘어간다.
function chooseBatch(advance) {
  const list = pool();
  if (list.length === 0) {
    state.current = [];
    saveState();
    return;
  }
  if (advance) state.batchNo++;
  if (state.order === 'random') {
    state.current = pickRandom(list);
  } else {
    if (advance) state.seqPos += state.seqStep || BATCH;
    state.seqPos = ((state.seqPos % list.length) + list.length) % list.length;
    const pick = pickSequential(list);
    state.current = pick.ids;
    state.seqStep = pick.step;
  }
  revealed.clear();
  saveState();
}

// 저장된 묶음이 아직 유효한지 확인하고, 아니면 다시 고른다
function ensureBatch() {
  const list = pool();
  const valid = state.current.length > 0 &&
    state.current.every((id) => list.some((w) => w.id === id)) &&
    state.current.length === Math.min(BATCH, list.length);
  if (!valid) chooseBatch(false);
}

function next() {
  chooseBatch(true);
  renderCards();
  restartAuto();
}

/* ---------- 카드 표시 ---------- */

// 탭해서 드러낸 카드 (id)
const revealed = new Set();

function renderCards() {
  const mode = MODES[state.mode] || MODES[0];
  el.modeBtn.textContent = mode.label;
  el.cards.textContent = '';

  if (words.length === 0) {
    el.cards.appendChild(emptyMsg('단어가 없습니다.\n⚙︎ 설정에서 단어를 추가하세요.'));
    return;
  }
  if (state.current.length === 0) {
    el.cards.appendChild(emptyMsg('모든 단어를 외웠어요!\n⚙︎ 설정에서 단어를 추가하거나\n외운 단어를 "포함"으로 바꾸세요.'));
    return;
  }

  for (const id of state.current) {
    const w = wordById(id);
    if (w) el.cards.appendChild(cardEl(w, mode));
  }
  fitCards();
}

// 카드 안에 글자가 다 들어가지 않으면 그 카드의 글자를 조금씩 줄인다 (--fit 배율)
function fitCards() {
  for (const card of el.cards.querySelectorAll('.card')) {
    const box = card.querySelector('.card-text');
    let fit = 1;
    box.style.setProperty('--fit', '1');
    while (fit > 0.4 && overflowing(box)) {
      fit -= 0.05;
      box.style.setProperty('--fit', fit.toFixed(2));
    }
  }
}

function overflowing(box) {
  if (box.scrollHeight > box.clientHeight + 1) return true;
  for (const line of box.querySelectorAll('.en, .ko')) {
    if (line.scrollHeight > line.clientHeight + 1 || line.scrollWidth > line.clientWidth + 1) return true;
  }
  return false;
}

if ('ResizeObserver' in window) {
  let raf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fitCards);
  }).observe(el.cards);
} else {
  window.addEventListener('resize', fitCards);
}

function emptyMsg(text) {
  const d = document.createElement('div');
  d.className = 'empty';
  d.style.whiteSpace = 'pre-line';
  d.textContent = text;
  return d;
}

function lineEl(cls, text, masked, hint) {
  const line = document.createElement('div');
  line.className = 'line ' + cls + (masked ? ' masked' : '');
  const t = document.createElement('span');
  t.className = 'txt';
  t.textContent = text;
  const h = document.createElement('span');
  h.className = 'mask-hint';
  h.textContent = hint;
  h.setAttribute('aria-hidden', 'true');
  line.append(t, h);
  return line;
}

function cardEl(w, mode) {
  const isRevealed = revealed.has(w.id);
  const card = document.createElement('div');
  card.className = 'card' + (w.status === 'known' || w.status === 'hard' ? ' ' + w.status : '');
  card.dataset.id = w.id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const text = document.createElement('div');
  text.className = 'card-text';
  const hideEn = mode.hideEn && !isRevealed;
  const hideKo = mode.hideKo && !isRevealed;
  text.append(
    lineEl('en', w.en, hideEn, '탭해서 영어 보기'),
    lineEl('ko', w.ko, hideKo, '탭해서 뜻 보기'),
  );
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.append(
    actBtn('speak', '🔊', '발음 듣기'),
    actBtn('known', '✓', '외웠음', w.status === 'known'),
    actBtn('hard', '?', '헷갈림', w.status === 'hard'),
  );
  card.append(text, actions);

  const hidden = hideEn ? '영어 가려짐, ' + w.ko : hideKo ? w.en + ', 뜻 가려짐' : w.en + ', ' + w.ko;
  card.setAttribute('aria-label', hidden);
  return card;
}

function actBtn(action, text, label, pressed) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'act';
  b.dataset.action = action;
  b.textContent = text;
  b.setAttribute('aria-label', label);
  b.title = label;
  if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
  return b;
}

// 외웠음/헷갈림 표시를 켜고 끈다 (둘은 함께 켜질 수 없음)
function toggleStatus(id, status) {
  const w = wordById(id);
  if (!w) return;
  w.status = w.status === status ? 'none' : status;
  saveWords();
  renderCards();   // 지금 묶음은 그대로 두고, 다음 묶음부터 반영
}

function toggleReveal(id) {
  if (state.mode === 0) return;
  if (revealed.has(id)) revealed.delete(id);
  else revealed.add(id);
  renderCards();
}

/* ---------- 이벤트: 집중 화면 ---------- */

el.cards.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const act = e.target.closest('.act');
  if (!act) {
    toggleReveal(card.dataset.id);
    return;
  }
  const id = card.dataset.id;
  if (act.dataset.action === 'speak') speak(wordById(id));
  else toggleStatus(id, act.dataset.action);
  restartAuto();
});

el.cards.addEventListener('keydown', (e) => {
  const card = e.target.closest('.card');
  if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    toggleReveal(card.dataset.id);
  }
});

el.modeBtn.addEventListener('click', () => {
  state.mode = (state.mode + 1) % MODES.length;
  revealed.clear();
  saveState();
  renderCards();
});

el.nextBtn.addEventListener('click', next);

// 외장 키보드: → 또는 N = 다음, M = 모드
document.addEventListener('keydown', (e) => {
  if (!el.settings.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') next();
  else if (e.key === 'm' || e.key === 'M') el.modeBtn.click();
});

/* ---------- 테마 ---------- */

function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'light' || state.theme === 'dark') root.dataset.theme = state.theme;
  else delete root.dataset.theme;
  updateThemeColor();
}

function updateThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeColor);

/* ---------- 설정 화면 ---------- */

function openSettings() {
  renderSettings();
  renderWordList();
  el.settings.hidden = false;
  el.focus.setAttribute('aria-hidden', 'true');
}

function closeSettings() {
  el.settings.hidden = true;
  el.focus.removeAttribute('aria-hidden');
  ensureBatch();
  renderCards();
}

el.settingsBtn.addEventListener('click', openSettings);
el.closeSettingsBtn.addEventListener('click', closeSettings);

function setSeg(seg, value) {
  seg.querySelectorAll('button').forEach((b) => {
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(b.dataset.value === String(value)));
  });
}

function renderSettings() {
  setSeg(el.themeSeg, state.theme);
  setSeg(el.orderSeg, state.order);
  setSeg(el.autoSeg, state.autoNext);
  setSeg(el.knownSeg, state.hideKnown ? 'hide' : 'show');
  setSeg(el.wakeSeg, state.wakeLock ? 'on' : 'off');
  el.fontRange.value = state.fontScale;
  el.fontValue.textContent = Math.round(state.fontScale * 100) + '%';
  renderWakeStatus();
}

function onSeg(seg, fn) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    fn(b.dataset.value);
    saveState();
    renderSettings();
  });
}

onSeg(el.themeSeg, (v) => { state.theme = v; applyTheme(); });
onSeg(el.orderSeg, (v) => { state.order = v; });
onSeg(el.autoSeg, (v) => { state.autoNext = Number(v); restartAuto(); });
onSeg(el.knownSeg, (v) => { state.hideKnown = v === 'hide'; });
onSeg(el.wakeSeg, (v) => { state.wakeLock = v === 'on'; updateWakeLock(); });

el.fontRange.addEventListener('input', () => {
  state.fontScale = Number(el.fontRange.value);
  applyFont();
  fitCards();
  el.fontValue.textContent = Math.round(state.fontScale * 100) + '%';
});
el.fontRange.addEventListener('change', saveState);

/* ---------- 글자 크기 ---------- */

function applyFont() {
  const v = Math.min(1.6, Math.max(0.6, Number(state.fontScale) || 1));
  document.documentElement.style.setProperty('--scale', String(v));
}

/* ---------- 발음 듣기 (Web Speech API) ---------- */

let enVoice = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  enVoice =
    voices.find((v) => /^en[-_]US$/i.test(v.lang) && v.localService) ||
    voices.find((v) => /^en[-_]US$/i.test(v.lang)) ||
    voices[0] || null;
}

if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', pickVoice);
}

function speak(w) {
  if (!w) return;
  if (!('speechSynthesis' in window)) {
    toast('이 브라우저는 음성 읽기를 지원하지 않습니다.');
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(w.en);
  u.lang = enVoice ? enVoice.lang : 'en-US';
  if (enVoice) u.voice = enVoice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

/* ---------- 자동 넘김 ---------- */

let autoTimer = 0;

function restartAuto() {
  clearInterval(autoTimer);
  autoTimer = 0;
  if (state.autoNext > 0) {
    autoTimer = setInterval(() => {
      // 설정 화면을 보고 있거나 앱이 가려져 있으면 넘기지 않는다
      if (el.settings.hidden && document.visibilityState === 'visible') {
        chooseBatch(true);
        renderCards();
      }
    }, state.autoNext * 1000);
  }
}

/* ---------- 화면 꺼짐 방지 (Wake Lock API) ---------- */

let wakeSentinel = null;
const wakeSupported = 'wakeLock' in navigator;

async function updateWakeLock() {
  if (!wakeSupported) { renderWakeStatus(); return; }
  if (state.wakeLock && document.visibilityState === 'visible') {
    if (!wakeSentinel) {
      try {
        wakeSentinel = await navigator.wakeLock.request('screen');
        wakeSentinel.addEventListener('release', () => {
          wakeSentinel = null;
          renderWakeStatus();
        });
      } catch (err) {
        wakeSentinel = null;
      }
    }
  } else if (wakeSentinel) {
    const s = wakeSentinel;
    wakeSentinel = null;
    await s.release().catch(() => {});
  }
  renderWakeStatus();
}

function renderWakeStatus() {
  if (!wakeSupported) el.wakeStatus.textContent = '이 브라우저는 지원하지 않습니다';
  else if (!state.wakeLock) el.wakeStatus.textContent = '';
  else el.wakeStatus.textContent = wakeSentinel ? '작동 중' : '앱이 화면에 보일 때 작동';
}

// 다른 앱으로 갔다 오면 Wake Lock이 풀리므로 다시 요청
document.addEventListener('visibilitychange', updateWakeLock);
// 시작할 때 요청이 거절됐으면 첫 터치 때 다시 시도
document.addEventListener('pointerdown', () => {
  if (state.wakeLock && !wakeSentinel) updateWakeLock();
});

/* ---------- 단어 추가 / 수정 / 삭제 ---------- */

const norm = (s) => s.trim().toLowerCase();

function findByEn(en) {
  const k = norm(en);
  return words.find((w) => norm(w.en) === k);
}

el.addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const en = el.addEn.value.trim();
  const ko = el.addKo.value.trim();
  if (!en || !ko) return;
  const dup = findByEn(en);
  if (dup) {
    toast(`"${dup.en}"은(는) 이미 있습니다.`);
    return;
  }
  words.push(makeWord(en, ko));
  saveWords();
  el.addEn.value = '';
  el.addKo.value = '';
  el.addEn.focus();
  renderWordList();
  toast(`"${en}" 추가됨`);
});

// "apple, 사과" → { en: 'apple', ko: '사과' }. 첫 쉼표(또는 탭) 기준으로 나눈다.
function parseLine(line) {
  const m = line.match(/^([^,\t]+)[,\t](.+)$/);
  if (!m) return null;
  const en = m[1].trim();
  const ko = m[2].trim();
  if (!en || !ko) return null;
  return { en, ko };
}

function bulkAdd(text) {
  let added = 0;
  let bad = 0;
  let dup = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;                  // 빈 줄은 무시
    const p = parseLine(line);
    if (!p) { bad++; continue; }
    if (findByEn(p.en)) { dup++; continue; }
    words.push(makeWord(p.en, p.ko));
    added++;
  }
  if (added) saveWords();
  return { added, bad, dup };
}

el.bulkBtn.addEventListener('click', () => {
  const { added, bad, dup } = bulkAdd(el.bulkText.value);
  const parts = [`${added}개 추가`];
  if (bad) parts.push(`형식이 틀린 ${bad}줄 건너뜀`);
  if (dup) parts.push(`이미 있는 단어 ${dup}개 건너뜀`);
  el.bulkResult.textContent = parts.join(' · ');
  if (added) el.bulkText.value = '';
  renderWordList();
});

const STATUS_TAG = { known: '외웠음', hard: '헷갈림' };

function renderWordList() {
  el.wordCount.textContent = `(${words.length})`;
  el.wordList.textContent = '';
  for (const w of words) el.wordList.appendChild(wordItem(w));
}

function wordItem(w) {
  const li = document.createElement('li');
  li.className = 'word-item';
  li.dataset.id = w.id;

  const info = document.createElement('div');
  info.className = 'w';
  const en = document.createElement('div');
  en.className = 'w-en';
  en.textContent = w.en;
  if (STATUS_TAG[w.status]) {
    const tag = document.createElement('span');
    tag.className = 'tag ' + w.status;
    tag.textContent = STATUS_TAG[w.status];
    en.appendChild(tag);
  }
  const ko = document.createElement('div');
  ko.className = 'w-ko';
  ko.textContent = w.ko;
  info.append(en, ko);

  li.append(info, smallBtn('수정', 'edit'), smallBtn('삭제', 'del', 'danger'));
  return li;
}

function smallBtn(text, action, extra) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn' + (extra ? ' ' + extra : '');
  b.textContent = text;
  b.dataset.action = action;
  return b;
}

function editItem(li, w) {
  li.className = 'word-item editing';
  li.textContent = '';
  const en = document.createElement('input');
  en.className = 'input';
  en.value = w.en;
  en.setAttribute('aria-label', '영어');
  en.autocapitalize = 'off';
  en.spellcheck = false;
  const ko = document.createElement('input');
  ko.className = 'input';
  ko.value = w.ko;
  ko.setAttribute('aria-label', '뜻');
  li.append(en, ko, smallBtn('저장', 'save', 'primary'), smallBtn('취소', 'cancel'));
  en.focus();

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); li.querySelector('[data-action="save"]').click(); }
    if (e.key === 'Escape') renderWordList();
  };
  en.addEventListener('keydown', onKey);
  ko.addEventListener('keydown', onKey);
}

el.wordList.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-action]');
  if (!b) return;
  const li = b.closest('.word-item');
  const w = wordById(li.dataset.id);
  if (!w) return;

  switch (b.dataset.action) {
    case 'edit':
      editItem(li, w);
      break;
    case 'cancel':
      renderWordList();
      break;
    case 'save': {
      const [enInput, koInput] = li.querySelectorAll('input');
      const en = enInput.value.trim();
      const ko = koInput.value.trim();
      if (!en || !ko) { toast('영어와 뜻을 모두 입력하세요.'); return; }
      const dup = findByEn(en);
      if (dup && dup.id !== w.id) { toast(`"${dup.en}"은(는) 이미 있습니다.`); return; }
      w.en = en;
      w.ko = ko;
      saveWords();
      renderWordList();
      break;
    }
    case 'del':
      if (!confirm(`"${w.en}"을(를) 삭제할까요?`)) return;
      words = words.filter((x) => x.id !== w.id);
      saveWords();
      renderWordList();
      break;
  }
});

/* ---------- 내보내기 / 가져오기 ---------- */

el.exportBtn.addEventListener('click', async () => {
  const data = {
    app: 'vocab3',
    version: 1,
    exportedAt: new Date().toISOString(),
    words: words.map(({ en, ko, status }) => ({ en, ko, status })),
  };
  const json = JSON.stringify(data, null, 2);
  const name = `vocab3-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });

  // 홈 화면 앱(standalone)에서는 다운로드가 막힐 수 있어 공유 시트를 우선 사용
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      el.backupResult.textContent = `${words.length}개 단어를 내보냈습니다.`;
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  el.backupResult.textContent = `${words.length}개 단어를 ${name}로 내보냈습니다.`;
});

el.importBtn.addEventListener('click', () => el.importFile.click());

el.importFile.addEventListener('change', async () => {
  const file = el.importFile.files[0];
  el.importFile.value = '';
  if (!file) return;
  try {
    const result = importJSON(JSON.parse(await file.text()));
    el.backupResult.textContent =
      `${result.added}개 추가, ${result.updated}개 갱신` +
      (result.bad ? `, 잘못된 항목 ${result.bad}개 건너뜀` : '');
    renderWordList();
  } catch (err) {
    el.backupResult.textContent = '가져오지 못했습니다: 올바른 JSON 파일이 아닙니다.';
  }
});

// [{en, ko}] 또는 {words: [{en, ko, status}]} 형식을 받는다. 같은 영어 단어는 덮어쓴다.
function importJSON(data) {
  const list = Array.isArray(data) ? data : data && Array.isArray(data.words) ? data.words : null;
  if (!list) throw new Error('format');
  let added = 0;
  let updated = 0;
  let bad = 0;
  for (const item of list) {
    const en = item && typeof item.en === 'string' ? item.en.trim() : '';
    const ko = item && typeof item.ko === 'string' ? item.ko.trim() : '';
    if (!en || !ko) { bad++; continue; }
    const status = STATUS_TAG[item.status] ? item.status : 'none';
    const existing = findByEn(en);
    if (existing) {
      existing.ko = ko;
      existing.status = status;
      updated++;
    } else {
      words.push(makeWord(en, ko, status));
      added++;
    }
  }
  saveWords();
  return { added, updated, bad };
}

el.resetBtn.addEventListener('click', () => {
  if (!confirm('모든 단어를 지우고 샘플 단어 10개로 되돌릴까요?')) return;
  words = sampleWords();
  saveWords();
  state.seqPos = 0;
  state.current = [];
  saveState();
  renderWordList();
  el.backupResult.textContent = '샘플 단어로 초기화했습니다.';
});

/* ---------- 토스트 ---------- */

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2200);
}

/* ---------- 시작 ---------- */

applyTheme();
applyFont();
ensureBatch();
renderCards();
restartAuto();
updateWakeLock();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
