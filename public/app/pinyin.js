// 自动检测：生产环境 /fun-kids/api，本地开发 /api
const BASE_PATH = window.location.pathname.replace(/\/(?:app\/|admin\/)?[^/]*$/, '').replace(/\/+$/, '');
const API_BASE = BASE_PATH + '/api';
const TOKEN_KEY = 'fun_kids_token';

// 声母表
const INITIALS = [
  'b','p','m','f','d','t','n','l',
  'g','k','h','j','q','x',
  'zh','ch','sh','r','z','c','s',
  'y','w'
];

// 韵母表
const FINALS = [
  'a','o','e','i','u','v',
  'ai','ei','ui','ao','ou','iu',
  'ie','ve','er',
  'an','en','in','un','vn',
  'ang','eng','ing','ong',
  'ia','iao','ian','iang','iong',
  'ua','uo','uai','uan','uang'
];

// v→ü/u 统一显示函数
// n/l 保留 ü；j/q/x/y 按拼写规则用 u 代替 ü 呈现给用户
function formatFinal(f, initial) {
  if (!f || !f.includes('v')) return f;
  // 无声母上下文（按钮标签）：v系显示为 ü 以区分 u系
  if (initial === undefined || initial === null) {
    return f.replace(/v/g, 'ü');
  }
  // n/l + v → nü, lü
  if (f === 'v' && ['n', 'l'].includes(initial)) return 'ü';
  // 零声母 + ve → üe
  if (f === 've' && initial === '') return 'üe';
  // j/q/x/y 等简写场景，v→u
  return f.replace(/v/g, 'u');
}

// 介母
const MEDIALS = ['i', 'u', 'v'];

// 介母+普通韵母组合 → { medial, base }
const MEDIAL_COMBOS = {
  'ia':   { medial: 'i', base: 'a' },
  'iao':  { medial: 'i', base: 'ao' },
  'ian':  { medial: 'i', base: 'an' },
  'iang': { medial: 'i', base: 'ang' },
  'iong': { medial: 'i', base: 'ong' },
  'ua':   { medial: 'u', base: 'a' },
  'uo':   { medial: 'u', base: 'o' },
  'uai':  { medial: 'u', base: 'ai' },
  'uan':  { medial: 'u', base: 'an' },
  'uang': { medial: 'u', base: 'ang' },
};

// 整体认读音节列表（前端兜底判断，不含声调）
const WHOLE_SYLLABLES = [
  'zhi', 'chi', 'shi', 'ri',
  'zi', 'ci', 'si',
  'yi', 'wu', 'yu',
  'ye', 'yue', 'yuan',
  'yin', 'yun', 'ying'
];

// 声调
const TONES = [
  { value: 1, label: 'ˉ 一声' },
  { value: 2, label: 'ˊ 二声' },
  { value: 3, label: 'ˇ 三声' },
  { value: 4, label: 'ˋ 四声' },
];

// 声母-韵母兼容规则 【优化版，剔除极少使用的拼音组合】
const INITIAL_FINAL_RULES = {
  // 唇音
  'b': ['a','o','i','u','ai','ei','ao','ie','an','en','in','ang','eng','ing','iao','ian'],
  'p': ['a','o','i','u','ai','ei','ao','ou','ie','an','en','in','ang','eng','ing','iao','ian'],
  'm': ['a','o','e','i','u','ai','ei','ao','ou','iu','ie','an','en','in','ang','eng','ing','iao','ian'],
  'f': ['a','o','u','ei','ou','an','en','ang','eng'],
  // 舌尖中音
  'd': ['a','e','i','u','ai','ei','ui','ao','ou','iu','ie','an','un','ang','eng','ing','ong','ia','iao','ian','uo','uan'],
  't': ['a','e','i','u','ai','ui','ao','ou','ie','an','un','ang','eng','ing','ong','iao','ian','uo','uan'],
  'n': ['a','e','i','u','v','ai','ei','ao','iu','ie','ve','an','en','in','ang','eng','ing','ong','iao','ian','iang','uo','uan'],
  'l': ['a','o','e','i','u','v','ai','ei','ao','ou','iu','ie','ve','an','in','un','ang','eng','ing','ong','ia','iao','ian','iang','uo','uan'],
  // 舌根音
  'g': ['a','e','u','ai','ei','ui','ao','ou','an','en','un','ang','eng','ong','ua','uo','uai','uan','uang'],
  'k': ['a','e','u','ai','ui','ao','ou','an','en','un','ang','eng','ong','ua','uo','uai','uan','uang'],
  'h': ['a','e','u','ai','ei','ui','ao','ou','an','en','un','ang','eng','ong','ua','uo','uai','uan','uang'],
  // 舌面音
  'j': ['i','v','iu','ie','ve','in','vn','ing','ia','iao','ian','iang','iong','uan'],
  'q': ['i','v','iu','ie','ve','in','vn','ing','ia','iao','ian','iang','iong','uan'],
  'x': ['i','v','iu','ie','ve','in','vn','ing','ia','iao','ian','iang','iong','uan'],
  // 翘舌音
  'zh': ['a','e','i','u','ai','ei','ui','ao','ou','an','en','un','ang','eng','ong','ua','uo','uai','uan','uang'],
  'ch': ['a','e','i','u','ai','ui','ao','ou','an','en','un','ang','eng','ong','uo','uai','uan','uang'],
  'sh': ['a','e','i','u','ai','ei','ui','ao','ou','an','en','un','ang','eng','ua','uo','uai','uan','uang'],
  'r': ['e','i','u','ui','ao','ou','an','en','un','ang','eng','ong','uo','uan'],
  // 平舌音
  'z': ['a','e','i','u','ai','ei','ui','ao','ou','an','en','un','ang','eng','ong','uo','uan'],
  'c': ['a','e','i','u','ai','ui','ao','ou','an','en','un','ang','eng','ong','uo','uan'],
  's': ['a','e','i','u','ai','ui','ao','ou','an','en','un','ang','eng','ong','uo','uan'],
  // 半元音
  'y': ['a','o','e','i','v','ao','ou','ve','an','in','vn','ang','ing','ong','uan'],
  'w': ['a','o','u','ai','ei','an','en','ang','eng'],
};

// 韵母-声母兼容规则（完整手工整理版）
// 韵母 'v' 代表 ü，'vn' 代表 ün，'ue' 代表 üe
// 韵母 'er' 没有与之相拼的声母，因此数组为空
const FINAL_INITIAL_MAP = {
  // 单韵母
  'a': ['b','p','m','f','d','t','n','l','g','k','h','zh','ch','sh','z','c','s','y','w'],
  'o': ['b','p','m','f','l','y','w'],
  'e': ['m','d','t','n','l','g','k','h','zh','ch','sh','r','z','c','s','y'],
  'i': ['b','p','m','d','t','n','l','j','q','x','zh','ch','sh','r','z','c','s','y'],
  'u': ['b','p','m','f','d','t','n','l','g','k','h','zh','ch','sh','r','z','c','s','w'],
  'v': ['n','l','j','q','x','y'],
  // 复韵母
  'ai': ['b','p','m','d','t','n','l','g','k','h','zh','ch','sh','z','c','s','w'],
  'ei': ['b','p','m','f','d','n','l','g','h','zh','sh','z','w'],
  'ui': ['d','t','g','k','h','zh','ch','sh','r','z','c','s'],
  'ao': ['b','p','m','d','t','n','l','g','k','h','zh','ch','sh','r','z','c','s','y'],
  'ou': ['p','m','f','d','t','l','g','k','h','zh','ch','sh','r','z','c','s','y'],
  'iu': ['m','d','n','l','j','q','x'],
  'ie': ['b','p','m','d','t','n','l','j','q','x'],
  've': ['n','l','j','q','x','y'],
  'er': [],
  // 前鼻韵母
  'an': ['b','p','m','f','d','t','n','l','g','k','h','zh','ch','sh','r','z','c','s','y','w'],
  'en': ['b','p','m','f','n','g','k','h','zh','ch','sh','r','z','c','s','w'],
  'in': ['b','p','m','n','l','j','q','x','y'],
  'un': ['d','t','l','g','k','h','zh','ch','sh','r','z','c','s'],
  'vn': ['j','q','x','y'],
  // 后鼻韵母
  'ang': ['b','p','m','f','d','t','n','l','g','k','h','zh','ch','sh','r','z','c','s','y','w'],
  'eng': ['b','p','m','f','d','t','n','l','g','k','h','zh','ch','sh','r','z','c','s','w'],
  'ing': ['b','p','m','d','t','n','l','j','q','x','y'],
  'ong': ['d','t','n','l','g','k','h','zh','ch','r','z','c','s','y'],
  // i 介母组合
  'ia': ['d','l','j','q','x'],
  'iao': ['b','p','m','d','t','n','l','j','q','x'],
  'ian': ['b','p','m','d','t','n','l','j','q','x'],
  'iang': ['n','l','j','q','x'],
  'iong': ['j','q','x'],
  // u 介母组合
  'ua': ['g','k','h','zh','sh'],
  'uo': ['d','t','n','l','g','k','h','zh','ch','sh','r','z','c','s'],
  'uai': ['g','k','h','zh','ch','sh'],
  'uan': ['d','t','n','l','g','k','h','j','q','x','zh','ch','sh','r','z','c','s','y'],
  'uang': ['g','k','h','zh','ch','sh'],
};

let selectedInitial = null;
let selectedFinal = null;
let selectedTone = null;
let currentItem = null;
let readAloudMode = false;
let currentAudio = null;
let speakAborted = false;

// 前端兜底：根据拼音判断是否整体认读音节
function checkWholeSyllable(item) {
  if (item.is_whole_syllable) return item;
  const initial = item.initial || '';
  const raw = initial + getDisplayFinal(item);
  if (WHOLE_SYLLABLES.includes(raw)) {
    item.is_whole_syllable = 1;
  }
  return item;
}

// 韵母内部名 → 音频文件名映射（v→ü）
const FINAL_FILENAME = { 'v': 'ü', 'vn': 'ün', 'ue': 'üe', 've': 'üe' };
function finalToFilename(f) { return FINAL_FILENAME[f] || f; }
const UE_SHORTHAND_INITIALS = new Set(['y', 'n', 'l', 'j', 'q', 'x']);

// 前端按钮韵母 → 后端韵母（这些声母下，üe 在后端统一记作 ue）
function mapUiFinalToApiFinal(initial, finalValue) {
  if (!finalValue) return finalValue;
  const displayFinal = finalToFilename(finalValue);
  if (UE_SHORTHAND_INITIALS.has(initial) && displayFinal === 'üe') return 'ue';
  return finalValue;
}

// 后端韵母 → 前端按钮韵母（按 finalToFilename 统一映射，优先命中现有按钮）
function mapApiFinalToUiFinal(initial, finalValue) {
  if (!finalValue) return finalValue;
  if (FINALS.includes(finalValue)) return finalValue;
  if (finalValue === 'ue' && UE_SHORTHAND_INITIALS.has(initial)) return 've';

  const displayFinal = finalToFilename(finalValue);
  const directMatch = FINALS.find(f => finalToFilename(f) === displayFinal);
  if (directMatch) return directMatch;
  return finalValue;
}

function getToneReadyFinal(item) {
  const initial = item.initial || '';
  const uiFinal = mapApiFinalToUiFinal(initial, item.final);
  if (!uiFinal) return uiFinal;
  if (uiFinal === 'v' && ['n', 'l'].includes(initial)) return 'v';
  if (uiFinal === 've' && initial === '') return 've';
  return uiFinal.replace(/v/g, 'u');
}

function getDisplayFinal(item) {
  const toneReadyFinal = getToneReadyFinal(item);
  return toneReadyFinal ? toneReadyFinal.replace(/v/g, 'ü') : toneReadyFinal;
}

function getDisplayPinyin(item) {
  const initial = item.initial || '';
  const toneReadyFinal = getToneReadyFinal(item);
  const tonedFinal = item.tone ? addTone(toneReadyFinal, item.tone) : toneReadyFinal;
  return initial + tonedFinal.replace(/v/g, 'ü');
}

// 切换点读模式开关，开启时自动选中一声
function toggleReadAloud() {
  readAloudMode = document.getElementById('readAloudToggle').checked;
  if (readAloudMode && selectedTone === null) {
    selectedTone = 1;
    const toneBtn = document.querySelector('[data-tone="1"]');
    if (toneBtn) toneBtn.classList.add('selected');
  }
}

// 初始化页面：渲染声母、韵母、声调按钮
function init() {
  // 声母
  const ig = document.getElementById('initialGrid');
  // 添加零声母按钮
  ig.innerHTML = `<button class="py-btn" data-initial="" onclick="selectInitial(this, '')">∅</button>`;
  ig.innerHTML += INITIALS.map(i =>
    `<button class="py-btn" data-initial="${i}" onclick="selectInitial(this, '${i}')">${i}</button>`
  ).join('');

  // 韵母
  const fg = document.getElementById('finalGrid');
  fg.innerHTML = FINALS.map(f => {
    const display = formatFinal(f);
    const lineBreak = f === 'ia' ? '<div style="flex-basis:100%;height:0"></div>' : '';

    if (MEDIAL_COMBOS[f]) {
      // 介母+普通韵母组合：显示为 "i + ong" 格式
      const combo = MEDIAL_COMBOS[f];
      const medialDisplay = formatFinal(combo.medial);
      const baseDisplay = formatFinal(combo.base);
      return lineBreak + `<button class="py-btn medial-combo" data-final="${f}" onclick="selectFinal(this, '${f}')"><span class="medial-part">${medialDisplay}</span><span class="plus-sign">+</span><span class="final-part">${baseDisplay}</span></button>`;
    } else if (MEDIALS.includes(f)) {
      // 介母：粉红色边框
      return `<button class="py-btn medial" data-final="${f}" onclick="selectFinal(this, '${f}')">${display}</button>`;
    } else {
      // 普通韵母：不变
      return `<button class="py-btn" data-final="${f}" onclick="selectFinal(this, '${f}')">${display}</button>`;
    }
  }).join('');

  // 声调
  const tg = document.getElementById('toneGrid');
  tg.innerHTML = TONES.map(t =>
    `<button class="py-btn tone-btn" data-tone="${t.value}" onclick="selectTone(this, ${t.value})">${t.label}</button>`
  ).join('');
}

// 选中声母按钮，更新韵母可用状态，点读模式下自动播放声母发音
function selectInitial(el, val) {
  document.querySelectorAll('[data-initial]').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedInitial = val;
  updateFinalAvailability();
  if (readAloudMode && val) {
    playVoiceFile(`initial-${val}.mp3`);
  }
}

// 选中韵母按钮，更新声母可用状态，点读模式下自动播放韵母发音
function selectFinal(el, val) {
  document.querySelectorAll('[data-final]').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedFinal = val;
  updateInitialAvailability();
  if (readAloudMode) {
    const tone = selectedTone !== null ? selectedTone : 1;
    playVoiceFile(`final-${finalToFilename(val)}-${tone}.mp3`);
  }
}

// 选中声调按钮，点读模式下自动播放当前韵母对应声调的发音
function selectTone(el, val) {
  document.querySelectorAll('[data-tone]').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedTone = val;
  if (readAloudMode && selectedFinal !== null) {
    playVoiceFile(`final-${finalToFilename(selectedFinal)}-${val}.mp3`);
  }
}

// 根据已选声母，禁用不兼容的韵母按钮（灰显不可点击）
function updateFinalAvailability() {
  document.querySelectorAll('[data-final]').forEach(btn => {
    btn.classList.remove('disabled');
  });

  if (selectedInitial !== null && INITIAL_FINAL_RULES[selectedInitial]) {
    const allowed = INITIAL_FINAL_RULES[selectedInitial];
    document.querySelectorAll('[data-final]').forEach(btn => {
      const f = btn.dataset.final;
      if (!allowed.includes(f)) {
        btn.classList.add('disabled');
        if (selectedFinal === f) {
          selectedFinal = null;
          btn.classList.remove('selected');
        }
      }
    });
  }
}

// 根据已选韵母，禁用不兼容的声母按钮（灰显不可点击）
function updateInitialAvailability() {
  document.querySelectorAll('[data-initial]').forEach(btn => {
    btn.classList.remove('disabled');
  });

  if (selectedFinal !== null && FINAL_INITIAL_MAP[selectedFinal]) {
    const allowed = FINAL_INITIAL_MAP[selectedFinal];
    document.querySelectorAll('[data-initial]').forEach(btn => {
      const i = btn.dataset.initial;
      if (i === '') return;
      if (!allowed.includes(i)) {
        btn.classList.add('disabled');
        if (selectedInitial === i) {
          selectedInitial = null;
          btn.classList.remove('selected');
        }
      }
    });
  }
}

// 清除所有选中状态，重置声母、韵母、声调的选择
function clearAll() {
  selectedInitial = null;
  selectedFinal = null;
  selectedTone = null;
  document.querySelectorAll('.py-btn').forEach(b => {
    b.classList.remove('selected');
    b.classList.remove('disabled');
  });
}

// 打开结果弹窗遮罩层
function openResult() {
  document.getElementById('resultOverlay').classList.add('visible');
}

// 关闭结果弹窗遮罩层，同时终止音频播放
function closeResult() {
  document.getElementById('resultOverlay').classList.remove('visible');
  stopAudio(true);
}

// 终止当前音频播放；abortChain=true 时同时中止整条朗读链
function stopAudio(abortChain = false) {
  if (abortChain) speakAborted = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

// 点击遮罩层背景区域时关闭弹窗（点击卡片本身不关闭）
function closeResultOverlay(e) {
  if (e.target === document.getElementById('resultOverlay')) closeResult();
}

// 声调标注映射表（a→ā/á/ǎ/à 等）
const toneMap = {
  'a': ['ā','á','ǎ','à'], 'o': ['ō','ó','ǒ','ò'], 'e': ['ē','é','ě','è'],
  'i': ['ī','í','ǐ','ì'], 'u': ['ū','ú','ǔ','ù'], 'v': ['ǖ','ǘ','ǚ','ǜ'],
};

// 给韵母字符串加上声调符号，按 a>o>e>i>u>ü 优先级标注
function addTone(finalStr, tone) {
  const priority = ['a','o','e','i','u','v'];
  for (const ch of priority) {
    if (finalStr.includes(ch)) {
      if (ch === 'i' && finalStr.includes('u') && finalStr.indexOf('u') > finalStr.indexOf('i')) {
        return finalStr.replace('u', toneMap['u'][tone - 1]);
      }
      if (ch === 'u' && finalStr.includes('i') && finalStr.indexOf('i') > finalStr.indexOf('u')) {
        return finalStr.replace('i', toneMap['i'][tone - 1]);
      }
      return finalStr.replace(ch, (toneMap[ch] || [ch, ch, ch, ch])[tone - 1]);
    }
  }
  return finalStr;
}

// 组合查询：根据已选的声母+韵母+声调，向后端请求匹配的拼音条目并展示结果
async function combine() {
  if (selectedFinal === null) {
    showError('请先选择韵母哦~');
    return;
  }
  if (selectedTone === null) {
    showError('请先选择声调哦~');
    return;
  }

  const initial = selectedInitial !== null ? selectedInitial : '';
  const finalForApi = mapUiFinalToApiFinal(initial, selectedFinal);
  const params = new URLSearchParams({ initial, final: finalForApi, tone: selectedTone });

  try {
    const res = await fetch(API_BASE + `/pinyin?${params}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    if (res.status === 401) { localStorage.clear(); location.reload(); return; }
    const data = await res.json();

    if (data.length > 0) {
      showResult(checkWholeSyllable(data[0]));
    } else {
      let finalForTone = selectedFinal;
      if (selectedFinal.includes('v') && !formatFinal(selectedFinal, initial).includes('ü')) {
        finalForTone = selectedFinal.replace(/v/g, 'u');
      }
      let displayFinal = addTone(finalForTone, selectedTone);
      displayFinal = displayFinal.replace(/v/g, 'ü');
      const pinyinStr = initial + displayFinal;
      showError(`"${pinyinStr}" 这个组合暂时没有对应的字哦，换一个试试吧！`);
    }
  } catch {
    showError('网络开小差了，再试试吧~');
  }
}

// 构建拼音拆解展示（如 b + a + ˉ = bā），用于结果卡片顶部
function buildBreakdown(item) {
  const displayPinyin = getDisplayPinyin(item);
  if (item.is_whole_syllable) {
    return `<div class="pinyin-breakdown">
      <span class="result-py">${displayPinyin}</span>
      <span style="font-size:14px;color:#999;margin-left:8px;">整体认读</span>
    </div>`;
  }
  const ini = item.initial || '';
  const tonedFinal = getDisplayPinyin({ ...item, initial: '' });
  const parts = [];
  if (ini) parts.push(`<span class="part">${ini}</span>`);
  if (ini) parts.push(`<span class="symbol">+</span>`);
  parts.push(`<span class="part">${tonedFinal}</span>`);
  parts.push(`<span class="equals">=</span>`);
  parts.push(`<span class="result-py">${displayPinyin}</span>`);
  return `<div class="pinyin-breakdown">${parts.join('')}</div>`;
}

// 展示查询结果卡片：显示拼音拆解、图片/emoji、汉字、释义和朗读按钮，自动朗读
function showResult(item) {
  currentItem = item;
  const card = document.getElementById('resultCard');
  let imageHtml = '';

  if (item.image) {
    imageHtml = `<img class="result-image" src="${BASE_PATH}/uploads/pinyin_image/${encodeURIComponent(item.image)}" alt="${item.char}">`;
  } else if (item.emoji) {
    imageHtml = `<div class="result-emoji">${item.emoji}</div>`;
  }

  card.innerHTML = `
    ${buildBreakdown(item)}
    ${imageHtml}
    <div class="result-char gradient-text">${item.char}</div>
    <div class="result-meaning">${item.meaning || ''}</div>
    <button class="speak-btn" onclick="speakFull()" title="朗读">
      <i class="fas fa-volume-high"></i>
    </button>
  `;
  openResult();
  spawnConfetti(card);
  setTimeout(() => speakFull(), 500);
}

// 在结果弹窗中显示错误提示信息（如组合不存在、网络错误等）
function showError(msg) {
  document.getElementById('resultCard').innerHTML = `
    <div class="result-error">
      <span>🤔</span>
      ${msg}
    </div>
  `;
  openResult();
}

// 播放 MP3 录音，返回 Promise
// checkAbort 参数：仅在 speakFull 链式朗读中传 true，点读模式单独播放时不检查 speakAborted
function playVoiceFile(filename, checkAbort = false) {
  const prefix = (filename.startsWith('initial-') || filename.startsWith('final-')) ? '/voice' : '/voice_entry';
  return new Promise((resolve) => {
    if (checkAbort && speakAborted) { resolve(); return; }
    stopAudio(false);
    const audio = new Audio(`${BASE_PATH}${prefix}/${encodeURIComponent(filename)}`);
    currentAudio = audio;
    audio.onended = () => { currentAudio = null; resolve(); };
    audio.onerror = () => { currentAudio = null; resolve(); };
    audio.play().catch(() => { currentAudio = null; resolve(); });
  });
}

// 朗读汉字发音
function speakChar(item) {
  if (item.voice_char) return playVoiceFile(item.voice_char, true);
  return Promise.resolve();
}

// 朗读释义发音
function speakMeaning(item) {
  if (item.voice_meaning) return playVoiceFile(item.voice_meaning, true);
  return Promise.resolve();
}

// 朗读（整体认读音节：字 → 意思；普通：字 → 声母录音 → 韵母录音 → 字 → 意思）
async function speakFull() {
  if (!currentItem) return;
  speakAborted = false;

  const item = currentItem;

  if (item.is_whole_syllable) {
    await speakChar(item);
    if (speakAborted) return;
    if (item.meaning) {
      await new Promise(r => setTimeout(r, 500));
      if (speakAborted) return;
      await speakMeaning(item);
    }
  } else {
    await speakChar(item);
    if (speakAborted) return;
    await new Promise(r => setTimeout(r, 500));
    if (speakAborted) return;

    if (item.initial) {
      await playVoiceFile(`initial-${item.initial}.mp3`, true);
      if (speakAborted) return;
      await new Promise(r => setTimeout(r, 500));
      if (speakAborted) return;
    }

    await playVoiceFile(`final-${finalToFilename(item.final)}-${item.tone}.mp3`, true);
    if (speakAborted) return;
    await new Promise(r => setTimeout(r, 500));
    if (speakAborted) return;

    await speakChar(item);
    if (speakAborted) return;

    if (item.meaning) {
      await new Promise(r => setTimeout(r, 500));
      if (speakAborted) return;
      await speakMeaning(item);
    }
  }
}

// 撒花动画效果：在结果卡片中生成彩色圆点掉落动画
function spawnConfetti(container) {
  const colors = ['#FF6F00','#E91E63','#9C27B0','#4CAF50','#2196F3','#FFEB3B'];
  for (let i = 0; i < 20; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.left = Math.random() * 100 + '%';
    el.style.top = Math.random() * 30 + '%';
    el.style.animationDelay = Math.random() * 0.5 + 's';
    el.style.width = el.style.height = (6 + Math.random() * 8) + 'px';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
}

// 随机推荐：从全部拼音数据中随机抽一个，自动选中对应的声母/韵母/声调并展示结果
async function randomPick() {
  try {
    const res = await fetch(API_BASE + '/pinyin', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
    });
    const data = await res.json();
    if (data.length > 0) {
      const item = data[Math.floor(Math.random() * data.length)];
      const uiFinal = mapApiFinalToUiFinal(item.initial, item.final);
      selectedInitial = item.initial;
      selectedFinal = uiFinal;
      selectedTone = item.tone;

      document.querySelectorAll('.py-btn').forEach(b => b.classList.remove('selected', 'disabled'));
      const initBtn = document.querySelector(`[data-initial="${item.initial}"]`);
      if (initBtn) initBtn.classList.add('selected');
      const finBtn = document.querySelector(`[data-final="${uiFinal}"]`);
      if (finBtn) finBtn.classList.add('selected');
      const toneBtn = document.querySelector(`[data-tone="${item.tone}"]`);
      if (toneBtn) toneBtn.classList.add('selected');

      updateFinalAvailability();
      updateInitialAvailability();
      showResult(checkWholeSyllable(item));
    }
  } catch {}
}

// 登录：提交密码验证，成功后保存 token 并显示主界面
async function doLogin() {
  const pw = document.getElementById('loginPassword').value.trim();
  const err = document.getElementById('loginError');
  if (!pw) { err.textContent = '请输入密码哦~'; return; }
  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw, role: 'user' }),
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem(TOKEN_KEY, data.token);
      document.getElementById('loginOverlay').classList.add('hidden');
      document.getElementById('appContent').classList.add('visible');
    } else { err.textContent = data.error || '密码错误哦~'; }
  } catch { err.textContent = '网络错误，请稍后再试'; }
}

function checkAuth() {
  if (localStorage.getItem(TOKEN_KEY)) {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContent').classList.add('visible');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const loginPassword = document.getElementById('loginPassword');
  if (loginPassword) {
    loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }

  checkAuth();
  init();
});