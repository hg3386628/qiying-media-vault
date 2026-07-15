/**
 * 栖影 — post-only gallery UI
 * Data: compact gzip shards under ./media-data/v2, with legacy posts.json fallback.
 */

import {
  listFeedPlayerIndexes,
  readFeedSoundEnabled,
  writeFeedSoundEnabled,
} from "./feed-policy.js";

const $ = (id) => document.getElementById(id);

function icon(name, className = "") {
  const cls = ["icon", className].filter(Boolean).join(" ");
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** anime.js v4 helpers — see https://animejs.com/documentation/getting-started/ */
function animeApi() {
  return window.anime || null;
}

function canAnimate() {
  return !prefersReducedMotion() && typeof animeApi()?.animate === "function";
}

if (canAnimate()) document.documentElement.classList.add("motion-enabled");

function animStagger(value, opts) {
  const a = animeApi();
  if (a && typeof a.stagger === "function") return a.stagger(value, opts);
  // fallback: fixed delay per index
  const base = typeof value === "number" ? value : 40;
  const from = opts?.start ?? 0;
  return (el, i) => from + i * base;
}

/**
 * 列表 / 瀑布流行入场：opacity + 轻微上移，stagger 错峰
 * @param {ParentNode|null} root
 * @param {string} selector
 * @param {{ delay?: number, duration?: number, y?: number, staggerMs?: number }} [opts]
 */
function animateEnter(root, selector, opts = {}) {
  if (!canAnimate() || !root) return null;
  const nodes = root.querySelectorAll(selector);
  if (!nodes.length) return null;
  const {
    delay = 0,
    duration = 420,
    y = 14,
    staggerMs = 36,
  } = opts;
  const a = animeApi();
  // 先压到起始态，避免 FOUC 闪一下
  nodes.forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = `translateY(${y}px)`;
    el.style.willChange = "opacity, transform";
  });
  try {
    return a.animate(nodes, {
      opacity: [0, 1],
      y: [y, 0],
      delay: animStagger(staggerMs, { start: delay }),
      duration,
      ease: "out(3)",
      composition: "replace",
      onComplete: () => {
        nodes.forEach((el) => {
          el.style.opacity = "";
          el.style.transform = "";
          el.style.willChange = "";
        });
      },
    });
  } catch {
    nodes.forEach((el) => {
      el.style.opacity = "";
      el.style.transform = "";
      el.style.willChange = "";
    });
    return null;
  }
}

/** 工作区标题 / 统计栏轻微 fade-in */
function animateChromeBits(root) {
  if (!canAnimate() || !root) return;
  const head = root.querySelector(".workspace-head, .wf-toolbar, .detail-hero, .state");
  if (!head) return;
  head.style.opacity = "0";
  head.style.transform = "translateY(8px)";
  try {
    animeApi().animate(head, {
      opacity: [0, 1],
      y: [8, 0],
      duration: 360,
      ease: "out(3)",
      onComplete: () => {
        head.style.opacity = "";
        head.style.transform = "";
      },
    });
  } catch {
    head.style.opacity = "";
    head.style.transform = "";
  }
}

/** lightbox 打开：面板 scale + fade（backdrop 用 CSS） */
function animateLightboxOpen() {
  if (!canAnimate() || !lightbox) return;
  const panel = lightbox.querySelector(".lightbox-panel");
  if (!panel) return;
  panel.style.opacity = "0";
  panel.style.transform = "translateY(10px) scale(0.985)";
  try {
    animeApi().animate(panel, {
      opacity: [0, 1],
      y: [10, 0],
      scale: [0.985, 1],
      duration: 280,
      ease: "out(4)",
      onComplete: () => {
        panel.style.opacity = "";
        panel.style.transform = "";
      },
    });
    const body = lightbox.querySelector(".lightbox-body");
    if (body) {
      body.style.opacity = "0";
      animeApi().animate(body, {
        opacity: [0, 1],
        duration: 320,
        delay: 40,
        ease: "out(2)",
        onComplete: () => {
          body.style.opacity = "";
        },
      });
    }
  } catch {
    panel.style.opacity = "";
    panel.style.transform = "";
  }
}

/** 媒体切换时 body 内图片/视频的轻微 crossfade */
function animateLightboxMediaSwap() {
  if (!canAnimate() || !lbBody) return;
  const media = lbBody.querySelector("img, video");
  if (!media) return;
  media.style.opacity = "0";
  media.style.transform = "scale(0.98)";
  try {
    animeApi().animate(media, {
      opacity: [0, 1],
      scale: [0.98, 1],
      duration: 260,
      ease: "out(3)",
      onComplete: () => {
        media.style.opacity = "";
        media.style.transform = "";
      },
    });
  } catch {
    media.style.opacity = "";
    media.style.transform = "";
  }
}

/** 瀑布流新插入的行：仅动画刚加的 .wf-row */
function animateWaterfallRows(grid, fromChildIndex) {
  if (!canAnimate() || !grid) return;
  const rows = [...grid.children].slice(fromChildIndex);
  if (!rows.length) return;
  const tiles = rows.flatMap((row) => [...row.querySelectorAll(".wf-item")]);
  if (!tiles.length) return;
  tiles.forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(12px) scale(0.98)";
  });
  try {
    animeApi().animate(tiles, {
      opacity: [0, 1],
      y: [12, 0],
      scale: [0.98, 1],
      delay: animStagger(28),
      duration: 380,
      ease: "out(3)",
      onComplete: () => {
        tiles.forEach((el) => {
          el.style.opacity = "";
          el.style.transform = "";
        });
      },
    });
  } catch {
    tiles.forEach((el) => {
      el.style.opacity = "";
      el.style.transform = "";
    });
  }
}

/** 空态 / 错误态弹入 */
function animateStateMessage(root) {
  if (!canAnimate() || !root) return;
  const box = root.querySelector(".state");
  if (!box) return;
  box.style.opacity = "0";
  box.style.transform = "translateY(12px) scale(0.98)";
  try {
    animeApi().animate(box, {
      opacity: [0, 1],
      y: [12, 0],
      scale: [0.98, 1],
      duration: 360,
      ease: "out(3)",
      onComplete: () => {
        box.style.opacity = "";
        box.style.transform = "";
      },
    });
  } catch {
    box.style.opacity = "";
    box.style.transform = "";
  }
}

/** 详情页进场 */
function animateDetailEnter(root) {
  if (!canAnimate() || !root) return;
  const hero = root.querySelector(".detail-hero") || root.querySelector(".detail");
  if (hero) {
    hero.style.opacity = "0";
    hero.style.transform = "translateY(12px)";
    try {
      animeApi().animate(hero, {
        opacity: [0, 1],
        y: [12, 0],
        duration: 400,
        ease: "out(3)",
        onComplete: () => {
          hero.style.opacity = "";
          hero.style.transform = "";
        },
      });
    } catch {
      hero.style.opacity = "";
      hero.style.transform = "";
    }
  }
  animateEnter(root, ".media-tile", { delay: 80, staggerMs: 28, y: 10, duration: 380 });
}

const appRoot = $("app");
const main = $("main");
const chromeEl = $("chrome");
const searchForm = $("searchForm");
const searchInput = $("searchInput");
const searchClear = $("searchClear");
const catChips = $("catChips");
const tagChips = $("tagChips");
const statsText = $("statsText");
const kindSeg = $("kindSeg");
const filtersEl = $("filters");
const filterToggle = $("filterToggle");
const filterReset = $("filterReset");
const filterCount = $("filterCount");
const mainTabs = $("mainTabs");
const backTop = $("backTop");

const lightbox = $("lightbox");
const lbTitle = $("lbTitle");
const lbSub = $("lbSub");
const lbBody = $("lbBody");
const lbFoot = $("lbFoot");
const lbPrev = $("lbPrev");
const lbNext = $("lbNext");
const lbClose = $("lbClose");
const lightboxBackdrop = $("lightboxBackdrop");

const APP_BASE_URL = new URL(".", document.baseURI);
const MEDIA_DATA_V2_URL = new URL("media-data/v2/", APP_BASE_URL);
const LEGACY_POSTS_URL = new URL("media-data/posts.json", APP_BASE_URL);
const STATIC_ONLY_HOST = /\.github\.io$/i.test(location.hostname);
const IMG_CDNS = [
  "https://imgpublic.ycomesc.live",
  "https://pic.jjlxoi.cn",
  "https://pic.uforxk.cn",
  "https://image.qzycbu.cn",
  "https://new.qzycbu.cn",
  "https://pwa.eisees.com",
];
const VID_CDN = "https://hls.ffxddn.cn";
/** 备用 m3u8 域名（源站现用 op.vkjyoi.cn；签名仍用同一 auth_key 算法） */
const VID_CDN_FALLBACKS = [
  "https://hls.ffxddn.cn",
  "https://op.vkjyoi.cn",
];
const HLS_KEY = "RnOxyCIc5eDPFpJY";
/** 经本地 server 反代 playlist，把 crypt.key / .ts 改写到同源 /api/proxy，规避多 CDN CORS/403 */
const HLS_PROXY = !STATIC_ONLY_HOST;
const PAGE_SIZE_KEY = "posts.pageSize";
const PAGE_SIZE_OPTIONS = [12, 20, 24, 36];
const DEFAULT_PAGE_SIZE = 20;
/** 全部图片瀑布流行高缩放（参考 xrw-album 100–300%） */
const IMAGE_SIZE_KEY = "posts.imageSize";
const IMAGE_SIZE_MIN = 100;
const IMAGE_SIZE_MAX = 300;
const IMAGE_SIZE_STEP = 10;
const DEFAULT_IMAGE_SIZE = 100;

/** Virtual buckets for posts with no scraped title (source 404). Route key 仍用「其他图片」；UI 展示「全部图片」 */
const CAT_OTHER_IMAGE = "其他图片";
const CAT_OTHER_VIDEO = "其他视频";
const CAT_OTHER_IMAGE_LABEL = "全部图片";
const VIRTUAL_CATS = new Set([CAT_OTHER_IMAGE, CAT_OTHER_VIDEO]);

const state = {
  posts: null,
  postByPid: new Map(),
  dataManifest: null,
  detailBuckets: new Map(),
  modeItems: { images: null, videos: null },
  modePromises: { images: null, videos: null },
  categories: [], // {name, count} real meta categories only
  tags: [], // {name, count} from scraped meta (有标题帖)
  otherImageCount: 0,
  otherVideoCount: 0,
  titledCount: 0,
  routeToken: 0,
  browse: { items: [], index: -1 },
  hls: null,
  searchTimer: 0,
  filterOpen: false,
  lightboxReturnFocus: null,
  lastScrollY: 0,
  scrollTick: false,
  /** session seed for stable random order of「全部」across pages */
  randomSeed: Math.floor(Math.random() * 0x7fffffff) || 1,
  randomOrder: null, // int[] indices into titled subset only
  titledIndices: null, // int[] indices of posts with real titles
  /** 全部图片 · 显示大小 100–300 */
  imageScale: readImageScale(),

  /** 全部图片 · 瀑布流无限滚动（参考 xrw-album） */
  waterfall: {
    items: [],
    cursor: 0,
    loading: false,
    observer: null,
    batch: 36,
  },
  /** 其他视频 · 抖音式竖滑（参考 tiktok-hls-feed） */
  feed: {
    items: [],
    cursor: 0,
    active: -1,
    players: new Map(), // index -> { video, hls }
    batch: 8,
    root: null,
    scroller: null,
    onScroll: null,
    onPointerActivity: null,
    controlsTimer: 0,
    soundEnabled: readFeedSoundEnabled(),
    soundUnlocked: false,
  },
};

const WATERFALL_BATCH = 36;
const FEED_BATCH = 8;
const FEED_PRELOAD = 1; // active ±1
const FEED_CONTROLS_HIDE_MS = 3200;

/** Category heat rank — source-site editorial / 点击榜 proxies (no raw click field in export) */
const CAT_HEAT = {
  最高点击: 100,
  必吃大瓜: 90,
  今日吃瓜: 80,
  深夜撸片: 50,
  明星黑料: 45,
  网红黑料: 40,
  师生专栏: 35,
  海角乱伦: 30,
  "91探花": 28,
  社会奇闻: 25,
  反差靓女: 22,
  自拍偷拍: 20,
  猎奇重口: 18,
  网黄合集: 15,
  擦边短剧: 10,
};

/* ---------------- utils ---------------- */

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) return dt.toLocaleDateString("zh-CN");
    return String(d).slice(0, 10);
  } catch {
    return "";
  }
}

function fmtDur(sec) {
  sec = Number(sec) || 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function readPageSize() {
  try {
    const n = parseInt(localStorage.getItem(PAGE_SIZE_KEY) || "", 10);
    if (PAGE_SIZE_OPTIONS.includes(n)) return n;
  } catch {}
  return DEFAULT_PAGE_SIZE;
}

function writePageSize(n) {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(n));
  } catch {}
}

function readImageScale() {
  let stored = DEFAULT_IMAGE_SIZE;
  try {
    stored = Number(localStorage.getItem(IMAGE_SIZE_KEY) || DEFAULT_IMAGE_SIZE);
  } catch {
    stored = DEFAULT_IMAGE_SIZE;
  }
  return Number.isFinite(stored)
    ? Math.min(IMAGE_SIZE_MAX, Math.max(IMAGE_SIZE_MIN, stored))
    : DEFAULT_IMAGE_SIZE;
}

function setImageScale(value) {
  const n = Math.min(
    IMAGE_SIZE_MAX,
    Math.max(IMAGE_SIZE_MIN, Number(value) || DEFAULT_IMAGE_SIZE)
  );
  // snap to step
  const stepped =
    Math.round((n - IMAGE_SIZE_MIN) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP + IMAGE_SIZE_MIN;
  state.imageScale = Math.min(IMAGE_SIZE_MAX, Math.max(IMAGE_SIZE_MIN, stepped));
  try {
    localStorage.setItem(IMAGE_SIZE_KEY, String(state.imageScale));
  } catch {
    // private / blocked storage
  }
  return state.imageScale;
}

function imgUrl(src) {
  if (!src) return "";
  if (src.startsWith("/api/")) return src;
  if (String(src).includes("ycomesc.live")) return src;
  if (STATIC_ONLY_HOST) return src;
  return `/api/img?url=${encodeURIComponent(src)}`;
}

function pathOnly(u) {
  if (!u) return "";
  let s = String(u);
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      s = new URL(s).pathname;
    } catch {}
  }
  if (s && !s.startsWith("/")) s = `/${s}`;
  return s;
}

/* small md5 for HLS signing */
function md5browser(str) {
  function cmn(q, a, b, x, s, t) {
    a = (a + q + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  function md5blk(s) {
    const blks = [];
    for (let i = 0; i < 64; i += 4) {
      blks[i >> 2] =
        s.charCodeAt(i) +
        (s.charCodeAt(i + 1) << 8) +
        (s.charCodeAt(i + 2) << 16) +
        (s.charCodeAt(i + 3) << 24);
    }
    return blks;
  }
  function md5cycle(x, k) {
    let [a, b, c, d] = x;
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = (a + x[0]) | 0;
    x[1] = (b + x[1]) | 0;
    x[2] = (c + x[2]) | 0;
    x[3] = (d + x[3]) | 0;
  }
  function md51(s) {
    const n = s.length;
    const stateArr = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= n; i += 64) md5cycle(stateArr, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    const tail = Array(16).fill(0);
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(stateArr, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(stateArr, tail);
    return stateArr;
  }
  function rhex(n) {
    let s = "";
    for (let j = 0; j < 4; j++) {
      // 每字节 2 个 hex（高半字节 + 低半字节）→ 每 word 8 字符 → 共 32
      s += ((n >> (j * 8 + 4)) & 0x0f).toString(16);
      s += ((n >> (j * 8)) & 0x0f).toString(16);
    }
    return s;
  }
  function hex(x) {
    for (let i = 0; i < x.length; i++) x[i] = rhex(x[i]);
    return x.join("");
  }
  return hex(md51(unescape(encodeURIComponent(str))));
}

function signVideoClient(rawPath, v = "3", t1 = "0", cdnBase = VID_CDN) {
  let p = pathOnly(rawPath);
  if (!p) return "";
  const timeNow = Math.floor(Date.now() / 1000);
  const rand = md5browser(p + String(timeNow)).slice(0, 13);
  const uid = v === "3" ? t1 : "0";
  const data = `${p}-${timeNow}-${rand}-${uid}-${HLS_KEY}`;
  const sign = md5browser(data);
  const base = (cdnBase || VID_CDN).replace(/\/$/, "");
  return `${base}${p}?auth_key=${timeNow}-${rand}-${uid}-${sign}&v=${v}&time=${t1}`;
}

function isHlsPath(rawPath) {
  return /\.m3u8(\?|$)/i.test(String(rawPath || ""));
}

function isProgressivePath(rawPath) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(rawPath || ""));
}

/**
 * 播放地址统一走服务端签名（path=），避免浏览器 md5 实现偏差导致 CDN 400。
 * /api/hls?path=...  → 服务端 sign + 拉 m3u8 + 改写 key/ts
 * /api/proxy?path=... → progressive mp4
 */
function hlsPlayUrl(rawPath) {
  const p = pathOnly(rawPath);
  if (!p) return "";
  if (!HLS_PROXY) return signVideoClient(p);
  return `/api/hls?path=${encodeURIComponent(p)}`;
}

function hlsPlayUrlOn(rawPath, cdnBase) {
  const p = pathOnly(rawPath);
  if (!p) return "";
  if (!HLS_PROXY) return signVideoClient(p, "3", "0", cdnBase);
  let host = "";
  try {
    host = new URL(cdnBase || VID_CDN).hostname;
  } catch {
    host = String(cdnBase || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  const q = host
    ? `path=${encodeURIComponent(p)}&host=${encodeURIComponent(host)}`
    : `path=${encodeURIComponent(p)}`;
  return `/api/hls?${q}`;
}

function progressivePlayUrl(rawPath, cdnBase = VID_CDN) {
  const p = pathOnly(rawPath);
  if (!p) return "";
  if (!HLS_PROXY) return signVideoClient(p, "3", "0", cdnBase);
  let host = "";
  try {
    host = new URL(cdnBase || VID_CDN).hostname;
  } catch {
    host = String(cdnBase || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  const q = host
    ? `path=${encodeURIComponent(p)}&host=${encodeURIComponent(host)}`
    : `path=${encodeURIComponent(p)}`;
  return `/api/proxy?${q}`;
}

/**
 * 统一挂载视频源：
 * - .m3u8 → hls.js + /api/hls
 * - .mp4  → progressive + /api/proxy（源站大量 status≠1 的 mp4 已失效，会走 onError）
 */
function createVideoPlayer(video, rawPath, { onReady, onError } = {}) {
  if (!rawPath) {
    onError && onError({ details: "empty-path" });
    return null;
  }

  // progressive MP4 / WebM
  if (isProgressivePath(rawPath) && !isHlsPath(rawPath)) {
    let hostIdx = 0;
    const hosts = VID_CDN_FALLBACKS.length ? VID_CDN_FALLBACKS : [VID_CDN];
    let destroyed = false;

    const tryLoad = () => {
      if (destroyed) return;
      const base = hosts[Math.min(hostIdx, hosts.length - 1)];
      const src = progressivePlayUrl(rawPath, base);
      const onOk = () => {
        if (!destroyed) onReady && onReady();
      };
      const onFail = () => {
        if (destroyed) return;
        if (hostIdx < hosts.length - 1) {
          hostIdx += 1;
          tryLoad();
          return;
        }
        onError && onError({ details: "progressive-load-error", type: "networkError" });
      };
      video.addEventListener("loadeddata", onOk, { once: true });
      video.addEventListener("error", onFail, { once: true });
      video.src = src;
      try {
        video.load();
      } catch {}
    };

    tryLoad();
    return {
      get instance() {
        return null;
      },
      destroy() {
        destroyed = true;
        try {
          video.removeAttribute("src");
          video.load();
        } catch {}
      },
    };
  }

  // HLS m3u8
  if (!window.Hls || !Hls.isSupported()) {
    const url = hlsPlayUrl(rawPath);
    if (video.canPlayType("application/vnd.apple.mpegurl") && url) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => onReady && onReady(), { once: true });
      return null;
    }
    if (url) {
      video.src = url;
      video.addEventListener("loadeddata", () => onReady && onReady(), { once: true });
      return null;
    }
    onError && onError({ details: "no-hls-support" });
    return null;
  }

  let hostIdx = 0;
  const hosts = VID_CDN_FALLBACKS.length ? VID_CDN_FALLBACKS : [VID_CDN];
  let hls = null;
  let destroyed = false;

  const loadAt = (idx) => {
    if (destroyed) return;
    if (hls) {
      try {
        hls.destroy();
      } catch {}
      hls = null;
    }
    const base = hosts[Math.min(idx, hosts.length - 1)];
    const src = hlsPlayUrlOn(rawPath, base);
    hls = new Hls({
      enableWorker: true,
      maxBufferLength: 20,
      maxMaxBufferLength: 40,
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (!destroyed) onReady && onReady();
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data?.fatal || destroyed) return;
      if (hostIdx < hosts.length - 1) {
        hostIdx += 1;
        try {
          hls.destroy();
        } catch {}
        hls = null;
        loadAt(hostIdx);
        return;
      }
      onError && onError(data);
    });
  };

  loadAt(0);
  return {
    get instance() {
      return hls;
    },
    destroy() {
      destroyed = true;
      if (hls) {
        try {
          hls.destroy();
        } catch {}
        hls = null;
      }
    },
  };
}

/** 兼容旧名 */
function createHlsPlayer(video, rawPath, opts) {
  return createVideoPlayer(video, rawPath, opts);
}

/* ---------------- data ---------------- */

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function parseMaybeGzipResponse(res) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  const first = bytes.find((value) => value > 32);
  if (first === 0x5b || first === 0x7b) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  if (typeof DecompressionStream !== "function") {
    throw new Error("browser does not support gzip streams");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

async function fetchCompressedJSON(url) {
  if (typeof DecompressionStream === "function") {
    try {
      const compressed = await fetch(`${url}.gz`, {
        cache: "force-cache",
        headers: { Accept: "application/gzip, application/json;q=0.9" },
      });
      if (compressed.ok) return await parseMaybeGzipResponse(compressed);
    } catch (error) {
      console.warn("[data] gzip fallback", url, error);
    }
  }
  return fetchJSON(url);
}

function dataUrl(relativePath) {
  return new URL(String(relativePath || "").replace(/^\/+/, ""), MEDIA_DATA_V2_URL).href;
}

function expandCover(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.startsWith("/")) return `${IMG_CDNS[0]}${raw}`;
  return raw;
}

function decodeCatalogPost(raw) {
  const imageCount = Number(raw.i) || 0;
  const videoCount = Number(raw.v) || 0;
  return {
    pid: Number(raw.p),
    created: raw.c || "",
    image_count: imageCount,
    video_count: videoCount,
    media_count: imageCount + videoCount,
    cover: expandCover(raw.r),
    title: raw.t || "",
    description: raw.d || "",
    author: raw.a || "",
    date_published: raw.u || "",
    date_modified: raw.m || "",
    categories: raw.k || [],
    tags: raw.g || [],
  };
}

function decodeDetailImage(raw) {
  const path = raw.p || "";
  return {
    id: raw.i,
    path,
    w: Number(raw.w) || 0,
    h: Number(raw.h) || 0,
    cover: expandCover(raw.c || path),
  };
}

function decodeDetailVideo(raw) {
  return {
    id: raw.i,
    path: raw.p || "",
    w: Number(raw.w) || 0,
    h: Number(raw.h) || 0,
    duration: Number(raw.d) || 0,
    status: raw.s == null ? "" : String(raw.s),
    cover: expandCover(raw.c),
  };
}

function decodeModeImage(raw, sourceIndex) {
  const path = raw.q || "";
  const cover = expandCover(raw.r || path);
  const post = {
    pid: Number(raw.p),
    created: raw.c || "",
    image_count: Number(raw.n) || 0,
    video_count: Number(raw.v) || 0,
    media_count: (Number(raw.n) || 0) + (Number(raw.v) || 0),
    cover,
  };
  return {
    kind: "image",
    pid: post.pid,
    post,
    cover,
    url: cover,
    path,
    w: Number(raw.w) || 3,
    h: Number(raw.h) || 4,
    id: raw.i,
    cdn_urls: path ? IMG_CDNS.map((base) => base + pathOnly(path)) : cover ? [cover] : [],
    name: (path || "").split("/").pop() || `img-${raw.i}`,
    sourceIndex,
  };
}

function decodeModeVideo(raw) {
  const path = raw.q || "";
  const cover = expandCover(raw.r);
  const post = {
    pid: Number(raw.p),
    created: raw.c || "",
    image_count: Number(raw.n) || 0,
    video_count: Number(raw.v) || 0,
    media_count: (Number(raw.n) || 0) + (Number(raw.v) || 0),
    cover,
  };
  return {
    pid: post.pid,
    post,
    path,
    cover,
    duration: Number(raw.d) || 0,
    id: raw.i,
    w: Number(raw.w) || 0,
    h: Number(raw.h) || 0,
    status: raw.s == null ? "" : String(raw.s),
    kind: isHlsPath(path) ? "hls" : isProgressivePath(path) ? "mp4" : "video",
  };
}

async function loadModeItems(mode) {
  if (!state.dataManifest) return null;
  if (state.modeItems[mode]) return state.modeItems[mode];
  if (state.modePromises[mode]) return state.modePromises[mode];
  const config = state.dataManifest.modes?.[mode];
  if (!config?.files?.length) return [];
  state.modePromises[mode] = Promise.all(
    config.files.map((entry) => fetchCompressedJSON(dataUrl(entry.file)))
  ).then((parts) => {
    const flat = parts.flat();
    const decoded =
      mode === "images"
        ? flat.map((item, index) => decodeModeImage(item, index))
        : flat.map(decodeModeVideo);
    state.modeItems[mode] = decoded;
    return decoded;
  }).finally(() => {
    state.modePromises[mode] = null;
  });
  return state.modePromises[mode];
}

async function loadPostDetail(pid) {
  await loadPosts();
  const summary = state.postByPid.get(Number(pid));
  if (!state.dataManifest) return summary || null;
  const bucketCount = Number(state.dataManifest.details?.buckets) || 1;
  const bucket = Number(pid) % bucketCount;
  let records = state.detailBuckets.get(bucket);
  if (!records) {
    const pattern = state.dataManifest.details?.pattern || "details/details-{bucket}.json";
    const file = pattern.replace("{bucket}", String(bucket).padStart(3, "0"));
    records = await fetchCompressedJSON(dataUrl(file));
    state.detailBuckets.set(bucket, records);
  }
  const detail = records.find((item) => Number(item.p) === Number(pid));
  if (!detail || !summary) return null;
  return {
    ...summary,
    images: (detail.i || []).map(decodeDetailImage),
    videos: (detail.v || []).map(decodeDetailVideo),
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with seeded RNG — stable for pagination */
function shuffleIndices(n, seed) {
  const idx = Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  return idx;
}

function postTimeMs(p) {
  const raw = p.date_published || p.date_modified || p.created || "";
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/** Heat proxy: 最高点击 etc. + media volume + recency (no click counts in JSON) */
function heatScore(p) {
  let s = 0;
  for (const c of p.categories || []) {
    s += (CAT_HEAT[c] || 0) * 1000;
  }
  s += (p.media_count || 0) * 40;
  s += (p.video_count || 0) * 25;
  s += (p.image_count || 0) * 8;
  // recency: up to ~ few thousand points over years
  s += Math.floor(postTimeMs(p) / 3.6e6); // hours since epoch-ish scale
  return s;
}

function categoryChipHeat(name, count) {
  return (CAT_HEAT[name] || 0) * 1_000_000 + count;
}

function hasRealTitle(p) {
  const t = (p.title || "").trim();
  return !!(t && t !== "未命名文档" && t !== "无标题");
}

/** Untitled → 其他图片 / 其他视频（有视频优先进「其他视频」） */
function otherBucket(p) {
  if (hasRealTitle(p)) return null;
  if ((p.video_count || 0) > 0) return CAT_OTHER_VIDEO;
  if ((p.image_count || 0) > 0) return CAT_OTHER_IMAGE;
  return null;
}

async function loadPosts() {
  if (state.posts) return state.posts;
  let manifest;
  try {
    manifest = await fetchCompressedJSON(dataUrl("manifest.json"));
  } catch (error) {
    console.warn("[data] v2 manifest unavailable, using legacy posts.json", error);
  }

  let posts;
  if (manifest) {
    if (Number(manifest.schema) !== 2) throw new Error(`unsupported data schema ${manifest.schema}`);
    try {
    const parts = await Promise.all(
      (manifest.catalog?.files || []).map((entry) =>
        fetchCompressedJSON(dataUrl(entry.file))
      )
    );
    posts = parts.flat().map(decodeCatalogPost);
    state.dataManifest = manifest;
    } catch (error) {
      throw new Error(`数据分片加载失败，请刷新重试：${error.message || error}`);
    }
  } else {
    posts = await fetchJSON(LEGACY_POSTS_URL.href);
    state.dataManifest = null;
  }
  state.posts = posts;
  state.postByPid = new Map(posts.map((post) => [Number(post.pid), post]));

  const titledIndices = [];
  let otherImage = 0;
  let otherVideo = 0;
  const map = new Map();
  const tagMap = new Map();

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    p._heat = heatScore(p);
    p._titled = hasRealTitle(p);
    p._other = otherBucket(p);

    if (p._titled) {
      titledIndices.push(i);
      for (const c of p.categories || []) {
        map.set(c, (map.get(c) || 0) + 1);
      }
      for (const t of p.tags || []) {
        const name = String(t || "").trim();
        if (!name) continue;
        tagMap.set(name, (tagMap.get(name) || 0) + 1);
      }
    } else if (p._other === CAT_OTHER_VIDEO) {
      otherVideo += 1;
    } else if (p._other === CAT_OTHER_IMAGE) {
      otherImage += 1;
    }
  }

  state.titledIndices = titledIndices;
  state.titledCount = titledIndices.length;
  state.otherImageCount = otherImage;
  state.otherVideoCount = otherVideo;
  state.categories = [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => categoryChipHeat(b.name, b.count) - categoryChipHeat(a.name, a.count));
  // 标签按出现次数；过滤过泛的站名噪音
  const TAG_NOISE = new Set(["91吃瓜", "91吃瓜网", "吃瓜", "吃瓜网"]);
  state.tags = [...tagMap.entries()]
    .filter(([name]) => !TAG_NOISE.has(name))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
  state.randomOrder = null;
  return state.posts;
}

/** Stable random order over titled posts only */
function ensureRandomOrder() {
  const base = state.titledIndices || [];
  if (state.randomOrder && state.randomOrder.length === base.length) {
    return state.randomOrder;
  }
  // shuffle permutation of titledIndices positions, map back to post indices
  const perm = shuffleIndices(base.length, state.randomSeed);
  state.randomOrder = perm.map((j) => base[j]);
  return state.randomOrder;
}

function reshuffleAll() {
  state.randomSeed = Math.floor(Math.random() * 0x7fffffff) || 1;
  state.randomOrder = null;
}

function postTitle(p) {
  const t = (p.title || "").trim();
  if (t && t !== "未命名文档" && t !== "无标题") return t;
  // 其他图片 / 其他视频：日期 + 媒体概况
  const when = formatDate(p.date_published || p.created);
  const bits = [
    when || null,
    p.image_count ? `${p.image_count} 图` : null,
    p.video_count ? `${p.video_count} 视频` : null,
  ].filter(Boolean);
  if (bits.length) return bits.join(" · ");
  return `帖子 #${p.pid}`;
}

function postCover(p) {
  return p.cover || p.images?.[0]?.cover || p.videos?.[0]?.cover || "";
}

function postToItems(post) {
  const items = [];
  for (const im of post.images || []) {
    const cover = im.cover || "";
    const path = im.path || "";
    const cdn_urls = path
      ? IMG_CDNS.map((b) => b + pathOnly(path))
      : cover
        ? [cover]
        : [];
    items.push({
      kind: "image",
      id: im.id,
      path,
      w: im.w,
      h: im.h,
      created: im.created,
      cover: cover || cdn_urls[0] || "",
      url: cover || cdn_urls[0] || "",
      cdn_urls,
      name: (path || "").split("/").pop() || `img-${im.id}`,
    });
  }
  for (const v of post.videos || []) {
    const path = v.path || "";
    const cover = v.cover || "";
    const coverPath = pathOnly(v.cover || v.cover_path || "");
    const cdn_urls = coverPath
      ? IMG_CDNS.map((b) => b + coverPath)
      : cover
        ? [cover]
        : [];
    items.push({
      kind: "video",
      id: v.id,
      path,
      w: v.w,
      h: v.h,
      duration: v.duration || 0,
      created: v.created,
      cover: cover || cdn_urls[0] || "",
      cdn_urls,
      play_url: path ? signVideoClient(path) : "",
      name: (path || "").split("/").pop() || `vid-${v.id}`,
    });
  }
  return items;
}

/* ---------------- routing ---------------- */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs || "");
  const parts = (path || "").split("/").filter(Boolean);

  let pid = 0;
  if (parts[0] === "post" && parts[1]) pid = parseInt(parts[1], 10) || 0;
  else if (parts[0] === "posts" && parts[1]) pid = parseInt(parts[1], 10) || 0;
  else if (parts[0] === "media" && parts[1] === "posts" && parts[2])
    pid = parseInt(parts[2], 10) || 0;

  const pageSize = (() => {
    const rawPs = params.get("ps");
    if (rawPs) {
      const n = parseInt(rawPs, 10) || DEFAULT_PAGE_SIZE;
      return Math.min(60, Math.max(8, n));
    }
    return readPageSize();
  })();

  return {
    view: pid ? "detail" : "list",
    pid,
    page: Math.max(1, parseInt(params.get("p") || "1", 10) || 1),
    q: params.get("q") || "",
    pageSize,
    kind: params.get("kind") || "all", // all | image | video | mixed
    cat: params.get("cat") || "",
    tag: params.get("tag") || "",
  };
}

function listHash({
  page = 1,
  q = "",
  pageSize = DEFAULT_PAGE_SIZE,
  kind = "all",
  cat = "",
  tag = "",
} = {}) {
  const ps = new URLSearchParams();
  if (page > 1) ps.set("p", String(page));
  if (q) ps.set("q", q);
  if (pageSize !== DEFAULT_PAGE_SIZE) ps.set("ps", String(pageSize));
  if (kind && kind !== "all") ps.set("kind", kind);
  if (cat) ps.set("cat", cat);
  if (tag) ps.set("tag", tag);
  const s = ps.toString();
  return `#/${s ? `?${s}` : ""}`.replace("#/?", "#/?");
}

function detailHash(pid) {
  return `#/post/${pid}`;
}

/* ---------------- filter / list ---------------- */

function matchPost(p, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  if (String(p.pid).includes(s)) return true;
  if ((p.title || "").toLowerCase().includes(s)) return true;
  if ((p.author || "").toLowerCase().includes(s)) return true;
  if ((p.description || "").toLowerCase().includes(s)) return true;
  if ((p.created || "").toLowerCase().includes(s)) return true;
  for (const t of p.tags || []) if (String(t).toLowerCase().includes(s)) return true;
  for (const t of p.categories || []) if (String(t).toLowerCase().includes(s)) return true;
  return false;
}

function applyKindFilter(arr, kind) {
  if (kind === "image") return arr.filter((p) => (p.image_count || 0) > 0 && !(p.video_count > 0));
  if (kind === "video") return arr.filter((p) => (p.video_count || 0) > 0 && !(p.image_count > 0));
  if (kind === "mixed") return arr.filter((p) => (p.image_count || 0) > 0 && (p.video_count || 0) > 0);
  return arr;
}

/**
 * 「全部」：仅有标题帖子，随机顺序（会话内稳定）
 * 「其他图片/其他视频」：无标题帖子
 * 真实分类 / 标签 / 搜索：有标题按热度；纯搜索可命中无标题（pid 等）
 */
function filterPosts(route) {
  const q = (route.q || "").trim().toLowerCase();
  const posts = state.posts || [];
  const cat = route.cat || "";
  const tag = (route.tag || "").trim();
  const isAll = !cat && !tag && !q;
  const isVirtual = VIRTUAL_CATS.has(cat);

  let arr;
  if (isAll) {
    const order = ensureRandomOrder();
    arr = order.map((i) => posts[i]);
  } else if (isVirtual) {
    arr = posts.filter((p) => p._other === cat);
    if (q) arr = arr.filter((p) => matchPost(p, q));
    // 虚拟桶里基本无 scrapetag，tag 过滤通常为空
    if (tag) arr = arr.filter((p) => (p.tags || []).includes(tag));
    arr.sort((a, b) => postTimeMs(b) - postTimeMs(a) || (b.pid || 0) - (a.pid || 0));
  } else {
    // 有标题池；纯搜索时扩大到全库以便 pid 命中
    if (q && !cat && !tag) {
      arr = posts.filter((p) => matchPost(p, q));
    } else {
      arr = posts.filter((p) => p._titled);
      if (cat) arr = arr.filter((p) => (p.categories || []).includes(cat));
      if (tag) arr = arr.filter((p) => (p.tags || []).includes(tag));
      if (q) arr = arr.filter((p) => matchPost(p, q));
    }
    arr.sort((a, b) => (b._heat || 0) - (a._heat || 0) || (b.pid || 0) - (a.pid || 0));
  }

  return applyKindFilter(arr, route.kind);
}

function navHash(route, patch = {}) {
  return listHash({
    page: patch.page ?? 1,
    q: patch.q !== undefined ? patch.q : route.q,
    pageSize: patch.pageSize ?? route.pageSize,
    kind: patch.kind !== undefined ? patch.kind : route.kind,
    cat: patch.cat !== undefined ? patch.cat : route.cat,
    tag: patch.tag !== undefined ? patch.tag : route.tag,
  });
}

/* ---------------- render helpers ---------------- */

function setMain(html) {
  teardownSpecialModes();
  closeLightbox();
  main.innerHTML = html;
}

function teardownSpecialModes() {
  // waterfall observer
  if (state.waterfall.observer) {
    try {
      state.waterfall.observer.disconnect();
    } catch {}
    state.waterfall.observer = null;
  }
  state.waterfall.items = [];
  state.waterfall.cursor = 0;
  state.waterfall.loading = false;
  state.waterfall._leftover = [];

  // video feed players
  destroyAllFeedPlayers();
  if (state.feed.scroller && state.feed.onScroll) {
    state.feed.scroller.removeEventListener("scroll", state.feed.onScroll);
  }
  if (state.feed._onKey) {
    window.removeEventListener("keydown", state.feed._onKey);
    state.feed._onKey = null;
  }
  if (state.feed.root && state.feed.onPointerActivity) {
    state.feed.root.removeEventListener("pointermove", state.feed.onPointerActivity);
    state.feed.root.removeEventListener("pointerdown", state.feed.onPointerActivity);
    state.feed.onPointerActivity = null;
  }
  if (state.feed.controlsTimer) {
    clearTimeout(state.feed.controlsTimer);
    state.feed.controlsTimer = 0;
  }
  state.feed.items = [];
  state.feed.cursor = 0;
  state.feed.active = -1;
  state.feed.root = null;
  state.feed.scroller = null;
  state.feed.onScroll = null;
  document.body.classList.remove("feed-mode");
}

function destroyAllFeedPlayers() {
  for (const idx of listFeedPlayerIndexes(state.feed.players)) {
    destroyFeedPlayer(idx);
  }
}

function destroyFeedPlayer(index) {
  const p = state.feed.players.get(index);
  if (!p) return;
  try {
    p.video?.pause();
  } catch {}
  if (p.hlsWrap) {
    try {
      p.hlsWrap.destroy();
    } catch {}
  } else if (p.hls) {
    try {
      p.hls.destroy();
    } catch {}
  }
  if (p.video) {
    try {
      p.video.removeAttribute("src");
      p.video.load();
    } catch {}
  }
  state.feed.players.delete(index);
  const slide = state.feed.scroller?.querySelector(`[data-feed-idx="${index}"]`);
  if (slide) {
    const stage = slide.querySelector(".feed-stage");
    if (stage) stage.innerHTML = "";
    slide.classList.remove("is-playing", "is-loading", "needs-tap");
  }
}

function loadingHtml() {
  const cards = Array.from({ length: 12 }, () =>
    `<div class="skel-card"><div class="skel-shine"></div></div>`
  ).join("");
  return `<div class="skel-grid" aria-busy="true">${cards}</div>`;
}

function messageHtml(title, sub, isError = false) {
  return `
    <div class="state${isError ? " error" : ""}" role="${isError ? "alert" : "status"}">
      <div class="state-icon" aria-hidden="true">${icon(isError ? "x" : "archive")}</div>
      <div class="state-title">${escapeHtml(title)}</div>
      ${sub ? `<div class="state-sub">${escapeHtml(sub)}</div>` : ""}
    </div>`;
}

function thumbCandidates(url, path) {
  const out = [];
  const push = (u) => {
    if (u && !out.includes(u)) out.push(u);
  };
  if (url && String(url).includes("ycomesc.live")) push(url);
  const p = pathOnly(path || url || "");
  if (p) {
    for (const b of IMG_CDNS) push(b + p);
  }
  if (url) push(imgUrl(url));
  if (url && !url.startsWith("/api/")) push(url);
  return out;
}

function postCardHtml(p) {
  const title = postTitle(p);
  const cover = postCover(p);
  const cands = thumbCandidates(cover, p.images?.[0]?.path || cover);
  const first = cands[0] || "";
  const when = formatDate(p.date_published || p.created);
  const metaBits = [p.author, when, p.categories?.[0]].filter(Boolean);
  const tags = (p.tags || []).slice(0, 3);
  const mediaBadge = [
    p.image_count ? `${p.image_count} 图` : "",
    p.video_count ? `${p.video_count} 视频` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const mediaIcon = p.image_count && p.video_count ? "grid" : p.video_count ? "video" : "image";
  const href = detailHash(p.pid);

  return `
    <article class="post-card" data-pid="${p.pid}">
      <a class="post-media-link" href="${href}" aria-label="打开帖子：${escapeHtml(title)}">
        <div class="post-cover">
        ${
          first
            ? `<div class="media-loading" aria-hidden="true">${icon(
                "image"
              )}<span>正在载入</span></div><img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${escapeHtml(
                first
              )}" data-cands="${escapeHtml(cands.join("|"))}" />`
            : `<div class="ph ph-failed" role="img" aria-label="没有封面">${icon("image-off")}<span>没有封面</span></div>`
        }
        <div class="post-badges">
          <span class="badge">${icon(mediaIcon)}${escapeHtml(mediaBadge || "帖子")}</span>
        </div>
        </div>
      </a>
      <div class="post-body">
        <h2 class="post-title"><a href="${href}">${escapeHtml(title)}</a></h2>
        <div class="post-meta">${escapeHtml(metaBits.join(" · ") || `pid ${p.pid}`)}</div>
        ${
          tags.length
            ? `<div class="post-tags" aria-label="帖子标签">${tags
                .map(
                  (t) =>
                    `<button type="button" class="tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
                )
                .join("")}</div>`
            : ""
        }
      </div>
    </article>`;
}

function pagerHtml(route, pages) {
  const page = route.page;
  const mk = (p) => navHash(route, { page: p });

  const windowSize = window.innerWidth <= 640 ? 1 : 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = Math.min(pages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  const nums = [];
  if (start > 1) {
    nums.push(`<button type="button" class="pager-num" data-href="${mk(1)}">1</button>`);
    if (start > 2) nums.push(`<span class="pager-ellipsis">…</span>`);
  }
  for (let i = start; i <= end; i++) {
    nums.push(
      `<button type="button" class="pager-num${i === page ? " active" : ""}" ${
        i === page ? 'disabled aria-current="page"' : ""
      } data-href="${mk(i)}">${i}</button>`
    );
  }
  if (end < pages) {
    if (end < pages - 1) nums.push(`<span class="pager-ellipsis">…</span>`);
    nums.push(
      `<button type="button" class="pager-num" data-href="${mk(pages)}">${pages}</button>`
    );
  }

  const sizeOpts = PAGE_SIZE_OPTIONS.map(
    (n) => `<option value="${n}" ${n === route.pageSize ? "selected" : ""}>${n}/页</option>`
  ).join("");

  return `
    <nav class="pager" aria-label="分页">
      <button type="button" class="pager-btn" ${page <= 1 ? "disabled" : ""} data-href="${mk(page - 1)}" aria-label="上一页">
        ${icon("chevron-left")}<span>上一页</span>
      </button>
      <div class="pager-nums">${nums.join("")}</div>
      <button type="button" class="pager-btn" ${page >= pages ? "disabled" : ""} data-href="${mk(page + 1)}" aria-label="下一页">
        <span>下一页</span>${icon("chevron-right")}
      </button>
      <label class="pager-size">
        <span class="sr-only">每页条数</span>
        <select id="pageSizeSelect" aria-label="每页条数">${sizeOpts}</select>
      </label>
    </nav>`;
}

function bindImgFallback(root = main) {
  root.querySelectorAll("img[data-cands]").forEach((img) => {
    const list = (img.dataset.cands || "").split("|").filter(Boolean);
    let i = 0;
    img.onerror = () => {
      i += 1;
      if (i < list.length) img.src = list[i];
      else {
        const placeholder = document.createElement("div");
        placeholder.className = "ph ph-failed";
        placeholder.setAttribute("role", "img");
        placeholder.setAttribute("aria-label", "媒体暂不可用");
        placeholder.innerHTML = `${icon("image-off")}<span>媒体暂不可用</span>`;
        img.replaceWith(placeholder);
      }
    };
  });
}

function bindPager(route) {
  main.querySelectorAll("[data-href]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const href = btn.getAttribute("data-href");
      if (href && !btn.disabled) location.hash = href.startsWith("#") ? href : `#${href}`;
    });
  });
  const sel = $("pageSizeSelect");
  if (sel) {
    sel.addEventListener("change", () => {
      const n = parseInt(sel.value, 10) || DEFAULT_PAGE_SIZE;
      writePageSize(n);
      location.hash = navHash(route, { page: 1, pageSize: n });
    });
  }
}

function activeTab(route) {
  if (route.cat === CAT_OTHER_IMAGE) return "other-image";
  if (route.cat === CAT_OTHER_VIDEO) return "other-video";
  return "posts";
}

function activeFilterCount(route) {
  return [
    route.kind && route.kind !== "all",
    route.cat && !VIRTUAL_CATS.has(route.cat),
    route.tag,
  ].filter(Boolean).length;
}

function syncChromeHeight() {
  requestAnimationFrame(() => {
    const height = chromeEl?.offsetHeight || 0;
    document.documentElement.style.setProperty("--chrome-size", `${height}px`);
  });
}

function syncFilterPanel(route) {
  const postsList = route.view === "list" && activeTab(route) === "posts";
  const count = activeFilterCount(route);

  if (filterToggle) {
    filterToggle.hidden = !postsList;
    filterToggle.setAttribute("aria-expanded", state.filterOpen && postsList ? "true" : "false");
    filterToggle.title = state.filterOpen ? "收起筛选" : "展开筛选";
  }
  if (filterCount) {
    filterCount.hidden = count === 0;
    filterCount.textContent = count ? String(count) : "";
  }
  if (filterReset) filterReset.hidden = count === 0;
  if (filtersEl) {
    filtersEl.classList.toggle("is-collapsed", !state.filterOpen);
    if (postsList) filtersEl.removeAttribute("hidden");
    else filtersEl.setAttribute("hidden", "");
  }

  document.body.classList.toggle("detail-mode", route.view === "detail");
  document.body.classList.toggle("image-mode", route.view === "list" && activeTab(route) === "other-image");
  document.body.classList.toggle("list-mode", route.view === "list" && activeTab(route) === "posts");
  syncChromeHeight();
}

function syncMainTabs(route) {
  const tab = activeTab(route);
  mainTabs?.querySelectorAll(".main-tab").forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  syncFilterPanel(route);
  // counts
  const nPosts = $("tabCountPosts");
  const nImg = $("tabCountImages");
  const nVid = $("tabCountVideos");
  if (nPosts) nPosts.textContent = state.titledCount ? state.titledCount.toLocaleString("zh-CN") : "";
  if (nImg) nImg.textContent = state.otherImageCount ? state.otherImageCount.toLocaleString("zh-CN") : "";
  if (nVid) nVid.textContent = state.otherVideoCount ? state.otherVideoCount.toLocaleString("zh-CN") : "";
}

function wireMainTabs() {
  mainTabs?.querySelectorAll(".main-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab || "posts";
      const r = parseHash();
      if (tab === "other-image") {
        location.hash = navHash(r, {
          page: 1,
          cat: CAT_OTHER_IMAGE,
          tag: "",
          kind: "all",
          q: "",
        });
        return;
      }
      if (tab === "other-video") {
        location.hash = navHash(r, {
          page: 1,
          cat: CAT_OTHER_VIDEO,
          tag: "",
          kind: "all",
          q: "",
        });
        return;
      }
      // 帖子 tab
      const nextCat = VIRTUAL_CATS.has(r.cat) ? "" : r.cat;
      const nextTag = VIRTUAL_CATS.has(r.cat) ? "" : r.tag;
      if (!nextCat && !nextTag && !r.q) reshuffleAll();
      const href = navHash(r, { page: 1, cat: nextCat, tag: nextTag });
      if (location.hash === href || (!location.hash && !nextCat && !nextTag)) {
        renderList({ ...r, page: 1, cat: nextCat, tag: nextTag });
        return;
      }
      location.hash = href;
    });
  });
}

/* ---------------- chrome filters UI ---------------- */

function syncChrome(route) {
  if (searchInput) {
    searchInput.value = route.q || "";
    toggleSearchClear();
  }

  syncMainTabs(route);

  kindSeg?.querySelectorAll(".seg-btn").forEach((b) => {
    const on = b.dataset.kind === (route.kind || "all");
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });

  // category chips：全部(有标题) · 真实分类（其他图片/视频已上移到顶栏 Tab）
  if (catChips) {
    // 在帖子 tab 下，虚拟 cat 视为「全部」
    const effectiveCat = VIRTUAL_CATS.has(route.cat) ? "" : route.cat;
    const chips = [
      `<button type="button" class="chip${!effectiveCat ? " active" : ""}" data-cat="" aria-pressed="${
        !effectiveCat ? "true" : "false"
      }" title="仅有标题 · 随机">全部<span class="n">${(
        state.titledCount || 0
      ).toLocaleString("zh-CN")}</span></button>`,
      ...state.categories.slice(0, 18).map((c) => {
        const active = effectiveCat === c.name;
        return `<button type="button" class="chip${active ? " active" : ""}" data-cat="${escapeHtml(
          c.name
        )}" aria-pressed="${active ? "true" : "false"}" title="有标题 · 按热度">${escapeHtml(
          c.name
        )}<span class="n">${c.count}</span></button>`;
      }),
    ];
    catChips.innerHTML = chips.join("");
    catChips.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextCat = btn.getAttribute("data-cat") || "";
        if (!nextCat && !effectiveCat && !route.tag) reshuffleAll();
        const href = navHash(route, {
          page: 1,
          cat: nextCat,
          tag: route.tag,
        });
        if (location.hash === href || (!location.hash && !nextCat && !route.tag)) {
          if (!nextCat && !route.tag) {
            renderList({ ...route, page: 1, cat: "", tag: "", q: route.q });
            return;
          }
        }
        location.hash = href;
      });
    });
  }

  // tag chips — from local scraped meta
  if (tagChips) {
    const allTagActive = !route.tag;
    const topTags = state.tags.slice(0, 28);
    const chips = [
      `<button type="button" class="chip${allTagActive ? " active" : ""}" data-tag="" aria-pressed="${
        allTagActive ? "true" : "false"
      }" title="不限标签">全部<span class="n">${(
        state.titledCount || 0
      ).toLocaleString("zh-CN")}</span></button>`,
      ...topTags.map((t) => {
        const active = route.tag === t.name;
        return `<button type="button" class="chip${active ? " active" : ""}" data-tag="${escapeHtml(
          t.name
        )}" aria-pressed="${active ? "true" : "false"}" title="标签筛选">${escapeHtml(
          t.name
        )}<span class="n">${t.count}</span></button>`;
      }),
    ];
    if (route.tag && !topTags.some((t) => t.name === route.tag)) {
      const found = state.tags.find((t) => t.name === route.tag);
      const n = found ? found.count : "?";
      chips.splice(
        1,
        0,
        `<button type="button" class="chip active" data-tag="${escapeHtml(
          route.tag
        )}" aria-pressed="true">${escapeHtml(route.tag)}<span class="n">${n}</span></button>`
      );
    }
    tagChips.innerHTML = chips.join("");
    tagChips.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextTag = btn.getAttribute("data-tag") || "";
        const nextCat = VIRTUAL_CATS.has(route.cat) ? "" : route.cat;
        location.hash = navHash(route, { page: 1, tag: nextTag, cat: nextCat });
      });
    });
  }
}

function wireFilterSegs() {
  kindSeg?.querySelectorAll(".seg-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const r = parseHash();
      // 在「其他*」时点类型筛选 → 回到帖子 tab
      const cat = VIRTUAL_CATS.has(r.cat) ? "" : r.cat;
      location.hash = navHash(r, { page: 1, kind: b.dataset.kind || "all", cat });
    });
  });
}

function wireChromeActions() {
  filterToggle?.addEventListener("click", () => {
    state.filterOpen = !state.filterOpen;
    syncFilterPanel(parseHash());
    if (state.filterOpen) {
      requestAnimationFrame(() => filtersEl?.querySelector("button")?.focus({ preventScroll: true }));
    }
  });

  filterReset?.addEventListener("click", () => {
    const route = parseHash();
    location.hash = navHash(route, { page: 1, kind: "all", cat: "", tag: "" });
  });

  mainTabs?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const tabs = [...mainTabs.querySelectorAll(".main-tab")];
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(current + delta + tabs.length) % tabs.length];
    next?.focus();
    next?.click();
  });

  window.addEventListener("resize", syncChromeHeight, { passive: true });
}

/* ---------------- pages ---------------- */

function listHeading(route) {
  if (route.q) return `搜索“${route.q}”`;
  if (route.tag) return `#${route.tag}`;
  if (route.cat && !VIRTUAL_CATS.has(route.cat)) return route.cat;
  if (route.kind === "image") return "图片帖子";
  if (route.kind === "video") return "视频帖子";
  if (route.kind === "mixed") return "图文视频";
  return "帖子";
}

function isShuffleView(route) {
  return !route.q && !route.cat && !route.tag && (!route.kind || route.kind === "all");
}

async function renderList(route) {
  const token = ++state.routeToken;
  setMain(loadingHtml());
  statsText.textContent = "加载中…";
  try {
    await loadPosts();
    if (token !== state.routeToken) return;
    syncChrome(route);

    // 其他图片 → 瀑布流无限滚动
    if (route.cat === CAT_OTHER_IMAGE && !route.q) {
      await loadModeItems("images");
      if (token !== state.routeToken) return;
      return renderOtherImagesWaterfall(route, token);
    }
    // 其他视频 → 抖音式竖滑
    if (route.cat === CAT_OTHER_VIDEO && !route.q) {
      await loadModeItems("videos");
      if (token !== state.routeToken) return;
      return renderOtherVideosFeed(route, token);
    }

    const filtered = filterPosts(route);
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / route.pageSize));
    const page = Math.min(route.page, pages);
    const start = (page - 1) * route.pageSize;
    const items = filtered.slice(start, start + route.pageSize);

    let modeHint = "热度";
    if (!route.cat && !route.tag && !route.q) modeHint = "有标题 · 随机";
    else if (route.cat === CAT_OTHER_IMAGE || route.cat === CAT_OTHER_VIDEO) modeHint = "无标题";
    else if (route.tag) modeHint = `标签 · ${route.tag}`;
    else if (route.q && !route.cat) modeHint = "搜索";
    statsText.textContent = `共 ${total.toLocaleString("zh-CN")} 帖 · 本页 ${items.length} · ${modeHint} · 第 ${page}/${pages} 页${
      route.q ? ` · 「${route.q}」` : ""
    }${route.cat ? ` · ${route.cat}` : ""}${route.tag ? ` · #${route.tag}` : ""}`;

    document.title = route.q ? `搜索 ${route.q} · 栖影` : "栖影";

    if (!items.length) {
      setMain(messageHtml("没有匹配的帖子", "试试换关键词、分类或筛选范围"));
      animateStateMessage(main);
      return;
    }

    setMain(`
      <header class="workspace-head">
        <div class="workspace-title">
          <span class="workspace-kicker">LIBRARY</span>
          <h1 id="listTitle">${escapeHtml(listHeading(route))}</h1>
        </div>
        <div class="workspace-actions">
          <span class="result-count">${total.toLocaleString("zh-CN")} 条</span>
          ${
            isShuffleView(route)
              ? `<button type="button" class="shuffle-btn" id="shufflePosts">${icon(
                  "shuffle"
                )}<span>换一批</span></button>`
              : ""
          }
        </div>
      </header>
      <section class="post-grid" aria-labelledby="listTitle">${items.map(postCardHtml).join("")}</section>
      ${pagerHtml({ ...route, page }, pages)}
    `);
    bindImgFallback();
    bindPager({ ...route, page });
    // 卡片上的 tag 点击 → 按标签筛选（阻止进详情）
    main.querySelectorAll(".post-tags .tag[data-tag]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = el.getAttribute("data-tag") || "";
        if (!t) return;
        location.hash = navHash(route, { page: 1, tag: t, cat: VIRTUAL_CATS.has(route.cat) ? "" : route.cat });
      });
    });
    $("shufflePosts")?.addEventListener("click", () => {
      reshuffleAll();
      renderList({ ...route, page: 1 });
    });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    animateChromeBits(main);
    animateEnter(main, ".post-card", { staggerMs: 32, y: 16, duration: 420 });
  } catch (e) {
    if (token !== state.routeToken) return;
    statsText.textContent = "加载失败";
    setMain(messageHtml("加载失败", e.message, true));
    animateStateMessage(main);
  }
}

/* ---------- 全部图片：瀑布流 + 无限滚动（xrw-album 思路） ---------- */

function buildOtherImageItems(route) {
  if (state.dataManifest && state.modeItems.images) {
    return state.modeItems.images;
  }
  const posts = filterPosts({ ...route, cat: CAT_OTHER_IMAGE, q: route.q || "", tag: "" });
  // 展开为图片粒度；无图则退回帖封面
  const items = [];
  for (const p of posts) {
    const imgs = p.images || [];
    if (imgs.length) {
      for (const im of imgs) {
        const cover = im.cover || "";
        const path = im.path || "";
        const w = Number(im.w) || 0;
        const h = Number(im.h) || 0;
        const pathKey = pathOnly(path);
        const cdn_urls = pathKey
          ? IMG_CDNS.map((b) => b + pathKey)
          : cover
            ? [cover]
            : [];
        items.push({
          kind: "image",
          pid: p.pid,
          post: p,
          cover: cover || postCover(p) || cdn_urls[0] || "",
          url: cover || cdn_urls[0] || "",
          path,
          w: w > 0 ? w : 3,
          h: h > 0 ? h : 4,
          id: im.id,
          cdn_urls,
          name: (path || "").split("/").pop() || `img-${im.id}`,
          sourceIndex: items.length,
        });
      }
    } else {
      const cover = postCover(p);
      items.push({
        kind: "image",
        pid: p.pid,
        post: p,
        cover,
        url: cover,
        path: "",
        w: 3,
        h: 4,
        id: `p-${p.pid}`,
        cdn_urls: cover ? [cover] : [],
        name: `pid-${p.pid}`,
        sourceIndex: items.length,
      });
    }
  }
  return items;
}

function waterfallLayoutConfig() {
  const width = Math.max(280, (main?.clientWidth || window.innerWidth) - 8);
  const base = width < 520 ? 160 : width < 960 ? 220 : 280;
  const scale = state.imageScale || DEFAULT_IMAGE_SIZE;
  const targetHeight = Math.round((base * scale) / 100);
  const gap = width < 520 ? 8 : 12;
  return {
    width,
    targetHeight,
    gap,
    key: `${Math.round(width)}:${targetHeight}:${gap}:${scale}`,
  };
}

function layoutWaterfallBatch(items, config) {
  // justified rows like xrw-album
  const { width, targetHeight, gap } = config;
  const rows = [];
  let row = [];
  let rowAspect = 0;

  const flush = (force) => {
    if (!row.length) return;
    const gaps = (row.length - 1) * gap;
    const scale = force
      ? Math.min(1.15, (width - gaps) / (rowAspect * targetHeight))
      : (width - gaps) / (rowAspect * targetHeight);
    const h = Math.max(90, Math.round(targetHeight * scale));
    let used = 0;
    row.forEach((it, i) => {
      const isLast = i === row.length - 1;
      let w = isLast ? width - used : Math.max(60, Math.round(h * (it.w / it.h)));
      if (!isLast) used += w + gap;
      it.displayWidth = w;
      it.displayHeight = h;
    });
    rows.push(row);
    row = [];
    rowAspect = 0;
  };

  for (const raw of items) {
    const it = { ...raw };
    const ar = it.w / it.h;
    row.push(it);
    rowAspect += ar;
    const gaps = (row.length - 1) * gap;
    if (rowAspect * targetHeight + gaps >= width) flush(false);
  }
  // hold partial last row for next batch append
  const leftover = row;
  return { rows, leftover };
}

function waterfallTileHtml(it) {
  const cands = thumbCandidates(it.cover || it.url, it.path || it.cover);
  const first = cands[0] || "";
  const title = postTitle(it.post);
  const idx = it.sourceIndex ?? 0;
  return `
    <button type="button" class="wf-item" data-idx="${idx}"
       style="width:${it.displayWidth}px;height:${it.displayHeight}px"
       title="${escapeHtml(title)}"
       aria-label="预览 ${escapeHtml(title)}">
      ${
        first
          ? `<div class="media-loading" aria-hidden="true">${icon(
              "image"
            )}<span>正在载入</span></div><img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${escapeHtml(
              first
            )}" data-cands="${escapeHtml(cands.join("|"))}" />`
          : `<div class="ph ph-failed" role="img" aria-label="媒体暂不可用">${icon(
              "image-off"
            )}<span>媒体暂不可用</span></div>`
      }
      <span class="wf-cap">${escapeHtml(title)}</span>
    </button>`;
}

function openWaterfallLightbox(index) {
  const all = state.waterfall.items || [];
  if (!all.length) return;
  // browse 项与瀑布流同源，便于 ←→ 在全部图片间切换
  state.browse = {
    items: all.map((it) => ({
      kind: "image",
      id: it.id,
      path: it.path || "",
      w: it.w,
      h: it.h,
      cover: it.cover || it.url || "",
      url: it.url || it.cover || "",
      cdn_urls: it.cdn_urls || [],
      name: it.name || postTitle(it.post) || `pid ${it.pid}`,
      pid: it.pid,
    })),
    index: -1,
    pid: all[index]?.pid,
    from: "waterfall",
  };
  openLightbox(index);
}

function renderOtherImagesWaterfall(route, token) {
  document.title = `${CAT_OTHER_IMAGE_LABEL} · 栖影`;
  document.body.classList.remove("feed-mode");

  const all = buildOtherImageItems(route);
  state.waterfall.items = all;
  state.waterfall.cursor = 0;
  state.waterfall.loading = false;
  state.waterfall._leftover = [];
  state.waterfall._configKey = "";
  state.waterfall._route = route;
  state.waterfall._token = token;

  const scale = state.imageScale || DEFAULT_IMAGE_SIZE;
  statsText.textContent = `${CAT_OTHER_IMAGE_LABEL} · ${all.length.toLocaleString("zh-CN")} 张 · 显示 ${scale}%`;

  if (!all.length) {
    setMain(messageHtml("没有图片", `${CAT_OTHER_IMAGE_LABEL}分类为空`));
    animateStateMessage(main);
    return;
  }

  // setMain already tore down; write shell without second teardown of new observer
  closeLightbox();
  main.innerHTML = `
    <section class="waterfall-wrap" aria-labelledby="waterfallTitle">
      <header class="workspace-head workspace-head-compact">
        <div class="workspace-title">
          <span class="workspace-kicker">ALL MEDIA</span>
          <h1 id="waterfallTitle">${CAT_OTHER_IMAGE_LABEL}</h1>
        </div>
        <span class="result-count">${all.length.toLocaleString("zh-CN")} 张</span>
      </header>
      <div class="wf-toolbar">
        <label class="detail-size-control photo-size-control" data-photo-size>
          ${icon("zoom-in")}
          <span class="detail-size-label">显示大小</span>
          <input type="range" id="wfSizeSlider" min="${IMAGE_SIZE_MIN}" max="${IMAGE_SIZE_MAX}" step="${IMAGE_SIZE_STEP}" value="${scale}" aria-label="调整全部图片显示大小" />
          <span class="detail-size-value" id="wfSizeValue">${scale}%</span>
        </label>
        <span class="wf-toolbar-hint">选择图片进入预览，使用方向键切换</span>
      </div>
      <div class="waterfall" id="waterfall" aria-label="${CAT_OTHER_IMAGE_LABEL}瀑布流"></div>
      <div class="infinite-status" id="wfStatus"></div>
      <div class="infinite-sentinel" id="wfSentinel" aria-hidden="true"></div>
    </section>
  `;
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  animateChromeBits(main);

  const grid = $("waterfall");
  const status = $("wfStatus");
  const sentinel = $("wfSentinel");
  const sizeSlider = $("wfSizeSlider");
  const sizeValue = $("wfSizeValue");

  const rebuildFromStart = () => {
    if (token !== state.routeToken) return;
    state.waterfall.cursor = 0;
    state.waterfall.loading = false;
    state.waterfall._leftover = [];
    state.waterfall._configKey = "";
    if (grid) grid.innerHTML = "";
    appendBatch();
    if (all.length > WATERFALL_BATCH) appendBatch();
    statsText.textContent = `${CAT_OTHER_IMAGE_LABEL} · ${all.length.toLocaleString("zh-CN")} 张 · 显示 ${state.imageScale}%`;
  };

  sizeSlider?.addEventListener("input", () => {
    const next = setImageScale(sizeSlider.value);
    if (sizeValue) sizeValue.textContent = `${next}%`;
    rebuildFromStart();
  });

  grid?.addEventListener("click", (e) => {
    const btn = e.target.closest(".wf-item[data-idx]");
    if (!btn || !grid.contains(btn)) return;
    const idx = parseInt(btn.getAttribute("data-idx") || "-1", 10);
    if (idx < 0) return;
    openWaterfallLightbox(idx);
  });

  const appendBatch = () => {
    if (token !== state.routeToken) return;
    if (state.waterfall.loading) return;
    if (state.waterfall.cursor >= all.length && !(state.waterfall._leftover || []).length) {
      if (status) status.innerHTML = '<span class="end-label">已经到底</span>';
      return;
    }
    state.waterfall.loading = true;
    if (status) {
      status.innerHTML = `
        <span class="detail-loading-dot"></span>
        <span class="detail-loading-dot"></span>
        <span class="detail-loading-dot"></span>`;
    }

    const config = waterfallLayoutConfig();
    // 宽度/缩放变化时不重建已渲染，只影响后续行（缩放由 slider 整页 rebuild）
    state.waterfall._configKey = config.key;

    const slice = all.slice(state.waterfall.cursor, state.waterfall.cursor + WATERFALL_BATCH);
    state.waterfall.cursor += slice.length;
    const pending = [...(state.waterfall._leftover || []), ...slice];
    const holdPartial = state.waterfall.cursor < all.length;
    const { rows, leftover } = layoutWaterfallBatch(pending, config);
    // if holding partial, leftover is last incomplete row
    let useRows = rows;
    if (holdPartial && leftover.length) {
      state.waterfall._leftover = leftover;
    } else {
      // flush leftover as final row
      if (leftover.length) {
        const forced = layoutWaterfallBatch(leftover, config);
        useRows = rows.concat(forced.rows);
        // force-fit partial
        if (forced.leftover.length) {
          const conf2 = config;
          const gaps = (forced.leftover.length - 1) * conf2.gap;
          let aspect = forced.leftover.reduce((s, it) => s + it.w / it.h, 0);
          const h = Math.max(90, Math.round((conf2.width - gaps) / aspect));
          let used = 0;
          forced.leftover.forEach((it, i) => {
            const isLast = i === forced.leftover.length - 1;
            const w = isLast
              ? conf2.width - used
              : Math.max(60, Math.round(h * (it.w / it.h)));
            if (!isLast) used += w + conf2.gap;
            it.displayWidth = w;
            it.displayHeight = h;
          });
          useRows = useRows.concat([forced.leftover]);
        }
        state.waterfall._leftover = [];
      } else {
        state.waterfall._leftover = [];
      }
    }

    const html = useRows
      .map(
        (row) =>
          `<div class="wf-row" style="gap:${config.gap}px;margin-bottom:${config.gap}px">${row
            .map(waterfallTileHtml)
            .join("")}</div>`
      )
      .join("");
    if (grid) {
      const fromIdx = grid.children.length;
      grid.insertAdjacentHTML("beforeend", html);
      bindImgFallback(grid);
      animateWaterfallRows(grid, fromIdx);
    }

    state.waterfall.loading = false;
    const remain = all.length - state.waterfall.cursor + (state.waterfall._leftover || []).length;
    if (status) {
      if (remain <= 0) status.innerHTML = '<span class="end-label">已经到底</span>';
      else
        status.innerHTML = `<button type="button" class="more-btn" id="wfMore">${icon(
          "arrow-down"
        )}<span>继续加载 · 剩 ${remain.toLocaleString("zh-CN")}</span></button>`;
      $("wfMore")?.addEventListener("click", appendBatch);
    }
  };

  appendBatch();
  // second batch for first screen
  if (all.length > WATERFALL_BATCH) appendBatch();

  if (state.waterfall.observer) {
    try {
      state.waterfall.observer.disconnect();
    } catch {}
  }
  state.waterfall.observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) appendBatch();
    },
    { root: null, rootMargin: "900px 0px" }
  );
  if (sentinel) state.waterfall.observer.observe(sentinel);
}

/* ---------- 其他视频：抖音式竖滑 HLS（tiktok-hls-feed 思路） ---------- */

function buildOtherVideoItems(route) {
  if (state.dataManifest && state.modeItems.videos) {
    const items = [...state.modeItems.videos];
    items.sort((a, b) => {
      const rank = (it) => (it.kind === "hls" ? 0 : it.kind === "mp4" ? 2 : 1);
      return rank(a) - rank(b);
    });
    return items;
  }
  const posts = filterPosts({ ...route, cat: CAT_OTHER_VIDEO, q: route.q || "", tag: "" });
  const items = [];
  for (const p of posts) {
    const vids = p.videos || [];
    for (const v of vids) {
      const path = v.path || "";
      if (!path) continue;
      // 源数据里 .mp4 几乎全部 CDN 567/未转码（status 0/2/3）；Feed 只播可 HLS 的
      if (isProgressivePath(path) && !isHlsPath(path)) {
        // status===1 的 progressive 仍尝试；其余跳过
        if (String(v.status) !== "1") continue;
      }
      items.push({
        pid: p.pid,
        post: p,
        path,
        cover: v.cover || postCover(p),
        duration: v.duration || 0,
        id: v.id,
        w: v.w,
        h: v.h,
        status: v.status,
        kind: isHlsPath(path) ? "hls" : isProgressivePath(path) ? "mp4" : "video",
      });
    }
  }
  // HLS 优先
  items.sort((a, b) => {
    const rank = (it) => (it.kind === "hls" ? 0 : it.kind === "mp4" ? 2 : 1);
    return rank(a) - rank(b);
  });
  return items;
}

function feedSoundActive() {
  return state.feed.soundEnabled && state.feed.soundUnlocked;
}

function feedSoundControlState() {
  const active = feedSoundActive();
  return active
    ? { icon: "volume-2", label: "静音", pressed: "false", action: "关闭声音" }
    : { icon: "volume-x", label: "声音", pressed: "true", action: "打开声音" };
}

function updateFeedSoundControls() {
  const controlState = feedSoundControlState();
  state.feed.scroller?.querySelectorAll('[data-act="mute"]').forEach((control) => {
    const lab = control.querySelector(".feed-action-lab");
    const ico = control.querySelector(".feed-action-ico");
    if (lab) lab.textContent = controlState.label;
    if (ico) ico.innerHTML = icon(controlState.icon);
    control.setAttribute("aria-pressed", controlState.pressed);
    control.setAttribute("aria-label", controlState.action);
    control.title = controlState.action;
  });
}

function setFeedSoundEnabled(enabled, { unlock = enabled, persist = true } = {}) {
  state.feed.soundEnabled = Boolean(enabled);
  if (unlock) state.feed.soundUnlocked = true;
  if (persist) writeFeedSoundEnabled(state.feed.soundEnabled);
  const muted = !feedSoundActive();
  for (const player of state.feed.players.values()) {
    player.video.muted = muted;
  }
  updateFeedSoundControls();
}

function showFeedControls(timeoutMs = FEED_CONTROLS_HIDE_MS) {
  if (!state.feed.root) return;
  state.feed.root.classList.remove("controls-hidden");
  state.feed.root.querySelectorAll(".feed-meta, .feed-actions, .feed-empty-tip").forEach((node) => {
    node.hidden = false;
  });
  if (state.feed.controlsTimer) clearTimeout(state.feed.controlsTimer);
  state.feed.controlsTimer = 0;
  if (timeoutMs > 0) {
    state.feed.controlsTimer = window.setTimeout(() => {
      state.feed.controlsTimer = 0;
      state.feed.root?.classList.add("controls-hidden");
      state.feed.root
        ?.querySelectorAll(".feed-meta, .feed-actions, .feed-empty-tip")
        .forEach((node) => {
          node.hidden = true;
        });
    }, timeoutMs);
  }
}

function markFeedPlaying(index) {
  const slide = state.feed.scroller?.querySelector(`[data-feed-idx="${index}"]`);
  if (!slide) return;
  slide.classList.add("is-playing");
  slide.classList.remove("needs-tap");
  const hint = slide.querySelector(".feed-hint");
  if (hint) hint.hidden = true;
  const poster = slide.querySelector(".feed-poster");
  if (poster) poster.style.opacity = "0";
}

function showFeedHint(index, text) {
  const slide = state.feed.scroller?.querySelector(`[data-feed-idx="${index}"]`);
  if (!slide) return;
  slide.classList.add("needs-tap");
  const hint = slide.querySelector(".feed-hint");
  if (hint) {
    hint.hidden = false;
    hint.textContent = text;
  }
}

async function playFeedPlayer(index) {
  const player = state.feed.players.get(index) || ensureFeedPlayer(index);
  if (!player || state.feed.active !== index) return false;
  player.playRequested = true;
  player.video.muted = !feedSoundActive();
  if (!player.ready && player.video.readyState < 2) return false;
  try {
    await player.video.play();
    if (state.feed.active !== index) {
      player.video.pause();
      return false;
    }
    markFeedPlaying(index);
    return true;
  } catch {
    if (feedSoundActive()) {
      state.feed.soundUnlocked = false;
      player.video.muted = true;
      updateFeedSoundControls();
      try {
        await player.video.play();
        if (state.feed.active === index) {
          markFeedPlaying(index);
          showFeedHint(index, "点击开启声音");
          return true;
        }
      } catch {}
    }
    if (state.feed.active === index) showFeedHint(index, "点击播放");
    return false;
  }
}

function feedSlideHtml(it, index) {
  const title = postTitle(it.post);
  const when = formatDate(it.post.created);
  const cands = thumbCandidates(it.cover, it.cover);
  const poster = cands[0] || "";
  const soundControl = feedSoundControlState();
  return `
    <section class="feed-slide" data-feed-idx="${index}" data-pid="${it.pid}" tabindex="0" role="button" aria-label="${escapeHtml(
      `视频 ${index + 1}：${title}，点击播放或暂停`
    )}">
      <div class="feed-stage">
        ${
          poster
            ? `<img class="feed-poster" alt="" referrerpolicy="no-referrer" src="${escapeHtml(poster)}" data-cands="${escapeHtml(
                cands.join("|")
              )}" />`
            : ""
        }
      </div>
      <div class="feed-shade"></div>
      <div class="feed-meta">
        <div class="feed-pid">PID ${it.pid}</div>
        <div class="feed-title">${escapeHtml(title)}</div>
        <div class="feed-sub">${escapeHtml(
          [when, it.duration ? fmtDur(it.duration) : "", `${it.post.video_count || 0} 视频`]
            .filter(Boolean)
            .join(" · ")
        )}</div>
      </div>
      <aside class="feed-actions">
        <button type="button" class="feed-action" data-act="mute" title="${soundControl.action}" aria-label="${soundControl.action}" aria-pressed="${soundControl.pressed}">
          <span class="feed-action-ico">${icon(soundControl.icon)}</span>
          <span class="feed-action-lab">${soundControl.label}</span>
        </button>
        <a class="feed-action" href="${detailHash(it.pid)}" title="查看详情" aria-label="查看帖子详情">
          <span class="feed-action-ico">${icon("external-link")}</span>
          <span class="feed-action-lab">详情</span>
        </a>
        <button type="button" class="feed-action" data-act="next" title="下一条" aria-label="下一条视频">
          <span class="feed-action-ico">${icon("arrow-down")}</span>
          <span class="feed-action-lab">下一条</span>
        </button>
      </aside>
      <div class="feed-hint" hidden>点击播放</div>
      <div class="feed-loader" hidden>
        <span class="detail-loading-dot"></span>
        <span class="detail-loading-dot"></span>
        <span class="detail-loading-dot"></span>
      </div>
    </section>`;
}

function ensureFeedPlayer(index) {
  if (state.feed.players.has(index)) return state.feed.players.get(index);
  const it = state.feed.items[index];
  const slide = state.feed.scroller?.querySelector(`[data-feed-idx="${index}"]`);
  if (!it || !slide || !it.path) return null;

  const stage = slide.querySelector(".feed-stage");
  if (!stage) return null;
  slide.classList.add("is-loading");
  const loader = slide.querySelector(".feed-loader");
  if (loader) loader.hidden = false;

  const video = document.createElement("video");
  video.className = "feed-video";
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "metadata";
  video.muted = !feedSoundActive();
  video.loop = true;
  video.controls = false;
  // keep poster under video until playing
  stage.appendChild(video);

  let hls = null;
  let hlsWrap = null;
  let player = null;
  const onReady = () => {
    if (player) player.ready = true;
    slide.classList.remove("is-loading");
    if (loader) loader.hidden = true;
    if (state.feed.active === index && player?.playRequested) {
      void playFeedPlayer(index);
    }
  };

  if (it.path) {
    hlsWrap = createVideoPlayer(video, it.path, {
      onReady,
      onError: (data) => {
        slide.classList.remove("is-loading");
        if (loader) loader.hidden = true;
        slide.classList.add("needs-tap");
        const hint = slide.querySelector(".feed-hint");
        if (hint) {
          hint.hidden = false;
          const kind = isProgressivePath(it.path) ? "源失效/未转码" : "播放失败";
          hint.textContent = `${kind} · 上滑下一条`;
        }
        console.warn("[feed video]", it.path, data?.details || data?.type || data);
      },
    });
    hls = hlsWrap?.instance || null;
  } else {
    onReady();
    slide.classList.add("needs-tap");
  }

  player = { video, hls, hlsWrap, index, ready: video.readyState >= 2, playRequested: false };
  state.feed.players.set(index, player);
  return player;
}

function syncFeedPlayback(activeIndex) {
  state.feed.active = activeIndex;
  // ensure nearby
  for (let i = activeIndex - FEED_PRELOAD; i <= activeIndex + FEED_PRELOAD; i++) {
    if (i >= 0 && i < state.feed.cursor) ensureFeedPlayer(i);
  }
  // destroy far
  for (const idx of [...state.feed.players.keys()]) {
    if (Math.abs(idx - activeIndex) > FEED_PRELOAD) destroyFeedPlayer(idx);
  }
  // play active
  for (const [idx, player] of state.feed.players.entries()) {
    const slide = state.feed.scroller?.querySelector(`[data-feed-idx="${idx}"]`);
    if (idx === activeIndex) {
      player.playRequested = true;
      void playFeedPlayer(idx);
    } else {
      player.playRequested = false;
      try {
        player.video.pause();
      } catch {}
      slide?.classList.remove("is-playing");
    }
  }

  // append more when near end
  if (activeIndex >= state.feed.cursor - 3) {
    appendFeedSlides();
  }

  const it = state.feed.items[activeIndex];
  if (it) {
    statsText.textContent = `其他视频 · ${activeIndex + 1}/${state.feed.items.length.toLocaleString(
      "zh-CN"
    )} · pid ${it.pid} · 上滑切换`;
  }
  showFeedControls();
}

function appendFeedSlides() {
  const items = state.feed.items;
  if (state.feed.cursor >= items.length) return;
  const scroller = state.feed.scroller;
  if (!scroller) return;
  const end = Math.min(items.length, state.feed.cursor + FEED_BATCH);
  const frag = document.createDocumentFragment();
  const wrap = document.createElement("div");
  for (let i = state.feed.cursor; i < end; i++) {
    wrap.innerHTML = feedSlideHtml(items[i], i);
    frag.appendChild(wrap.firstElementChild);
  }
  scroller.appendChild(frag);
  bindImgFallback(scroller);
  // bind interactions on new slides
  for (let i = state.feed.cursor; i < end; i++) {
    bindFeedSlide(i);
  }
  state.feed.cursor = end;
}

function bindFeedSlide(index) {
  const slide = state.feed.scroller?.querySelector(`[data-feed-idx="${index}"]`);
  if (!slide || slide.dataset.bound) return;
  slide.dataset.bound = "1";

  slide.addEventListener("click", (e) => {
    if (e.target.closest(".feed-actions a, .feed-actions button")) return;
    showFeedControls();
    if (state.feed.active !== index) syncFeedPlayback(index);
    const player = state.feed.players.get(index) || ensureFeedPlayer(index);
    if (!player) return;
    if (!feedSoundActive()) {
      setFeedSoundEnabled(true, { unlock: true });
      void playFeedPlayer(index);
      return;
    }
    if (player.video.paused) {
      void playFeedPlayer(index);
    } else {
      player.playRequested = false;
      player.video.pause();
      slide.classList.remove("is-playing");
      const hint = slide.querySelector(".feed-hint");
      if (hint) {
        hint.hidden = false;
        hint.textContent = "已暂停";
      }
    }
  });

  slide.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest(".feed-actions a, .feed-actions button")) return;
    e.preventDefault();
    slide.click();
  });

  slide.querySelector('[data-act="mute"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    showFeedControls();
    if (state.feed.active !== index) syncFeedPlayback(index);
    const player = state.feed.players.get(index) || ensureFeedPlayer(index);
    if (!player) return;
    const enable = !feedSoundActive();
    setFeedSoundEnabled(enable, { unlock: true });
    void playFeedPlayer(index);
  });

  slide.querySelector('[data-act="next"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    showFeedControls();
    const next = state.feed.scroller?.querySelector(`[data-feed-idx="${index + 1}"]`);
    next?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  });
}

function renderOtherVideosFeed(route, token) {
  document.title = "其他视频 · 栖影";
  const all = buildOtherVideoItems(route);
  state.feed.items = all;
  state.feed.cursor = 0;
  state.feed.active = -1;

  statsText.textContent = `其他视频 · ${all.length.toLocaleString("zh-CN")} 条 · 上下滑动切换`;

  if (!all.length) {
    setMain(messageHtml("没有视频", "其他视频分类为空"));
    animateStateMessage(main);
    return;
  }

  closeLightbox();
  document.body.classList.add("feed-mode");
  main.innerHTML = `
    <div class="feed-shell" id="feedShell">
      <h1 class="sr-only">其他视频</h1>
      <div class="feed-scroller" id="feedScroller"></div>
      <div class="feed-empty-tip" id="feedTip">上下滑动切换，点按开启声音</div>
    </div>
  `;

  state.feed.scroller = $("feedScroller");
  state.feed.root = $("feedShell");
  state.feed.onPointerActivity = () => showFeedControls();
  state.feed.root?.addEventListener("pointermove", state.feed.onPointerActivity, { passive: true });
  state.feed.root?.addEventListener("pointerdown", state.feed.onPointerActivity, { passive: true });
  appendFeedSlides();
  appendFeedSlides(); // two batches
  updateFeedSoundControls();
  // 首屏 slide 轻微 fade（不干扰滚动）
  if (canAnimate() && state.feed.scroller) {
    const first = state.feed.scroller.querySelector(".feed-slide");
    if (first) {
      first.style.opacity = "0";
      try {
        animeApi().animate(first, {
          opacity: [0, 1],
          duration: 420,
          ease: "out(3)",
          onComplete: () => {
            first.style.opacity = "";
          },
        });
      } catch {
        first.style.opacity = "";
      }
    }
  }

  let scrollTick = false;
  const onScroll = () => {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      scrollTick = false;
      if (token !== state.routeToken) return;
      const scroller = state.feed.scroller;
      if (!scroller) return;
      const h = scroller.clientHeight || window.innerHeight;
      const idx = Math.round(scroller.scrollTop / h);
      const clamped = Math.max(0, Math.min(state.feed.cursor - 1, idx));
      if (clamped !== state.feed.active) syncFeedPlayback(clamped);
    });
  };
  state.feed.onScroll = onScroll;
  state.feed.scroller.addEventListener("scroll", onScroll, { passive: true });

  // keyboard (remove previous feed key handler if any)
  if (state.feed._onKey) {
    window.removeEventListener("keydown", state.feed._onKey);
  }
  const onKey = (e) => {
    if (token !== state.routeToken) return;
    if (!document.body.classList.contains("feed-mode")) return;
    const tag = e.target?.tagName || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      const next = state.feed.scroller?.querySelector(`[data-feed-idx="${state.feed.active + 1}"]`);
      next?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      const prev = state.feed.scroller?.querySelector(
        `[data-feed-idx="${Math.max(0, state.feed.active - 1)}"]`
      );
      prev?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    } else if (e.key === " " || e.key === "Spacebar") {
      if (e.target?.closest?.(".feed-slide")) return;
      e.preventDefault();
      const slide = state.feed.scroller?.querySelector(`[data-feed-idx="${state.feed.active}"]`);
      slide?.click();
    }
  };
  state.feed._onKey = onKey;
  window.addEventListener("keydown", onKey);

  // kick first
  requestAnimationFrame(() => {
    if (token !== state.routeToken) return;
    syncFeedPlayback(0);
  });
}

async function renderDetail(route) {
  const token = ++state.routeToken;
  setMain(loadingHtml());
  statsText.textContent = `帖子 #${route.pid}`;
  try {
    await loadPosts();
    if (token !== state.routeToken) return;
    syncChrome(route);

    const post = await loadPostDetail(route.pid);
    if (token !== state.routeToken) return;
    if (!post) {
      setMain(
        messageHtml("帖子不存在", `没有找到 pid ${route.pid}`) +
          `<div style="text-align:center;margin-top:16px"><a class="back" href="#/">← 返回列表</a></div>`
      );
      return;
    }

    const title = postTitle(post);
    document.title = `${title} · 栖影`;
    const cover = postCover(post);
    const cands = thumbCandidates(cover, post.images?.[0]?.path || cover);
    const items = postToItems(post);
    state.browse = { items, index: -1, pid: post.pid };

    const when = formatDate(post.date_published || post.created);
    const src = post.source_url || `https://www.91cg1.com/archives/${post.pid}/`;

    statsText.textContent = `pid ${post.pid} · ${post.image_count || 0} 图 · ${post.video_count || 0} 视频`;

    setMain(`
      <article class="detail">
        <a class="back" href="${navHash(route, { page: route.page })}">${icon(
          "arrow-left"
        )}<span>返回帖子</span></a>

        <div class="detail-hero">
          <div class="detail-cover">
            ${
              cands[0]
                ? `<div class="media-loading" aria-hidden="true">${icon(
                    "image"
                  )}<span>正在载入</span></div><img alt="" referrerpolicy="no-referrer" src="${escapeHtml(
                    cands[0]
                  )}" data-cands="${escapeHtml(
                    cands.join("|")
                  )}" />`
                : `<div class="ph ph-failed" role="img" aria-label="没有封面">${icon(
                    "image-off"
                  )}<span>没有封面</span></div>`
            }
          </div>
          <div class="detail-info">
            <span class="detail-kicker">POST DETAIL</span>
            <h1>${escapeHtml(title)}</h1>
            <div class="detail-byline">
              ${post.author ? `<span>${escapeHtml(post.author)}</span>` : ""}
              ${when ? `<span>${escapeHtml(when)}</span>` : ""}
              <span>PID ${post.pid}</span>
              <a class="detail-source" href="${escapeHtml(
                src
              )}" target="_blank" rel="noreferrer">${icon("external-link")}<span>打开源站</span></a>
            </div>
            <div class="detail-counts" aria-label="媒体数量">
              <span>${icon("image")}<strong>${post.image_count || 0}</strong> 图片</span>
              <span>${icon("video")}<strong>${post.video_count || 0}</strong> 视频</span>
            </div>
            ${
              post.description
                ? `<p class="detail-desc">${escapeHtml(post.description)}</p>`
                : ""
            }
            ${
              (post.categories || []).length
                ? `<div class="detail-categories" aria-label="分类">${(post.categories || [])
                    .map((category) => `<span>${escapeHtml(category)}</span>`)
                    .join("")}</div>`
                : ""
            }
            ${
              (post.tags || []).length
                ? `<div class="detail-tags">${(post.tags || [])
                    .map(
                      (t) =>
                        `<button type="button" class="tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
                    )
                    .join("")}</div>`
                : ""
            }
          </div>
        </div>

        <div class="section-heading">
          <h2>媒体</h2>
          <span>${items.length} 项</span>
        </div>
        ${
          items.length
            ? `<div class="media-grid">${items
                .map((it, i) => {
                  const isV = it.kind === "video";
                  const tc = thumbCandidates(it.cover || it.url, it.path);
                  return `
                  <button type="button" class="media-tile" data-idx="${i}" aria-label="${escapeHtml(
                    `预览 ${it.name || (isV ? "视频" : "图片")}`
                  )}">
                    ${
                      tc[0]
                        ? `<div class="media-loading" aria-hidden="true">${icon(
                            isV ? "video" : "image"
                          )}<span>正在载入</span></div><img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${escapeHtml(
                            tc[0]
                          )}" data-cands="${escapeHtml(tc.join("|"))}" />`
                        : `<div class="ph ph-failed">${icon("image-off")}<span>媒体暂不可用</span></div>`
                    }
                    ${isV ? `<span class="play">${icon("play")}</span>` : ""}
                    <span class="tile-badge">${
                      isV
                        ? it.duration
                          ? `${icon("video")}${fmtDur(it.duration)}`
                          : `${icon("video")}视频`
                        : it.w && it.h
                          ? `${icon("image")}${it.w}×${it.h}`
                          : `${icon("image")}图片`
                    }</span>
                  </button>`;
                })
                .join("")}</div>`
            : messageHtml("没有媒体", "这个帖子没有可展示的图片或视频")
        }
      </article>
    `);

    bindImgFallback();
    main.querySelectorAll(".media-tile[data-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx") || "-1", 10);
        openLightbox(idx);
      });
    });
    animateDetailEnter(main);
    main.querySelectorAll(".detail-tags .tag[data-tag]").forEach((el) => {
      el.addEventListener("click", () => {
        const t = el.getAttribute("data-tag") || "";
        if (!t) return;
        location.hash = navHash(route, { page: 1, tag: t, cat: "" });
      });
    });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  } catch (e) {
    if (token !== state.routeToken) return;
    setMain(messageHtml("加载失败", e.message, true));
    animateStateMessage(main);
  }
}

/* ---------------- lightbox ---------------- */

function closeLightbox() {
  if (state.hls) {
    try {
      state.hls.destroy();
    } catch {}
    state.hls = null;
  }
  if (lightbox) lightbox.hidden = true;
  if (appRoot) appRoot.inert = false;
  document.body.classList.remove("modal-open");
  if (lbBody) lbBody.innerHTML = "";
  if (lbFoot) lbFoot.innerHTML = "";
  state.browse.index = -1;
  const returnTarget = state.lightboxReturnFocus;
  state.lightboxReturnFocus = null;
  if (returnTarget?.isConnected) {
    requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));
  }
}

function openLightbox(index) {
  const items = state.browse.items || [];
  if (index < 0 || index >= items.length) return;
  state.browse.index = index;
  const it = items[index];
  const wasOpen = lightbox && !lightbox.hidden;
  if (!wasOpen) state.lightboxReturnFocus = document.activeElement;

  if (state.hls) {
    try {
      state.hls.destroy();
    } catch {}
    state.hls = null;
  }

  lbTitle.textContent = it.name || (it.kind === "video" ? "视频" : "图片");
  lbSub.textContent = `${index + 1} / ${items.length}${it.path ? ` · ${it.path}` : ""}`;
  lbPrev.disabled = index <= 0;
  lbNext.disabled = index >= items.length - 1;
  lbBody.innerHTML = "";
  lbFoot.innerHTML = "";

  if (it.kind === "video") {
    const play = it.path
      ? isHlsPath(it.path)
        ? hlsPlayUrl(it.path)
        : isProgressivePath(it.path)
          ? progressivePlayUrl(it.path)
          : signVideoClient(it.path)
      : it.play_url || "";
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("controlsList", "nodownload");
    lbBody.appendChild(video);
    if (it.path) {
      const wrap = createVideoPlayer(video, it.path, {
        onError: (data) => {
          const msg = isProgressivePath(it.path)
            ? "该源为 MP4 且 CDN 已失效/未转码（status≠1）"
            : `播放失败：${data?.details || data?.type || "fatal"}`;
          lbFoot.innerHTML =
            `<div class="lightbox-err">${escapeHtml(msg)}</div>` + lbFoot.innerHTML;
        },
      });
      state.hls = wrap
        ? {
            destroy() {
              wrap.destroy();
            },
          }
        : null;
    } else if (play) {
      video.src = play;
    } else {
      lbFoot.innerHTML = `<div class="lightbox-err">没有播放地址</div>`;
    }
    lbFoot.innerHTML += `
      <div class="lightbox-meta-line"><span>资源路径</span><code>${escapeHtml(it.path || "")}</code></div>
      <div class="lightbox-foot-row">
        ${
          play
            ? `<a class="lightbox-open" href="${escapeHtml(
                play
              )}" target="_blank" rel="noreferrer">${icon("external-link")}<span>打开播放地址</span></a>`
            : ""
        }
        <span class="lightbox-shortcuts"><kbd>←</kbd><kbd>→</kbd> 切换 · <kbd>Esc</kbd> 关闭</span>
      </div>
    `;
  } else {
    const cands = thumbCandidates(it.url || it.cover, it.path);
    const img = document.createElement("img");
    img.alt = it.name || "预览图片";
    img.referrerPolicy = "no-referrer";
    img.src = cands[0] || "";
    let i = 0;
    img.onerror = () => {
      i += 1;
      if (i < cands.length) img.src = cands[i];
      else {
        lbFoot.innerHTML = `<div class="lightbox-err">图片加载失败</div>`;
      }
    };
    lbBody.appendChild(img);
    const pidHint =
      it.pid != null
        ? `<span>PID ${escapeHtml(String(it.pid))}${
            state.browse.from === "waterfall"
              ? ` · <a href="${detailHash(it.pid)}">打开帖子</a>`
              : ""
          }</span>`
        : "";
    lbFoot.innerHTML = `
      <div class="lightbox-meta-line">${pidHint}<code>${escapeHtml(it.path || "")}</code></div>
      <div class="lightbox-foot-row">
        ${
          cands[0]
            ? `<a class="lightbox-open" href="${escapeHtml(
                cands[0]
              )}" target="_blank" rel="noreferrer">${icon("external-link")}<span>打开原图</span></a>`
            : ""
        }
        <span class="lightbox-shortcuts"><kbd>←</kbd><kbd>→</kbd> 切换 · <kbd>Esc</kbd> 关闭</span>
      </div>
    `;
  }

  lightbox.hidden = false;
  if (appRoot) appRoot.inert = true;
  document.body.classList.add("modal-open");
  try {
    lbClose.focus({ preventScroll: true });
  } catch {}
  if (wasOpen) animateLightboxMediaSwap();
  else animateLightboxOpen();
}

/* ---------------- search / chrome events ---------------- */

function toggleSearchClear() {
  if (!searchClear) return;
  searchClear.hidden = !searchInput.value;
}

function commitSearch(q) {
  const r = parseHash();
  const next = (q || "").trim();
  if ((r.q || "") === next && r.view === "list" && r.page === 1) return;
  // 搜索时回到帖子 tab（有标题池 + 可命中 pid）
  const cat = VIRTUAL_CATS.has(r.cat) ? "" : r.cat;
  location.hash = navHash(r, { page: 1, q: next, cat });
}

searchForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(state.searchTimer);
  searchInput.blur();
  commitSearch(searchInput.value);
});

searchInput?.addEventListener("input", () => {
  toggleSearchClear();
  clearTimeout(state.searchTimer);
  const q = searchInput.value.trim();
  if (q.length > 0 && q.length < 2) return;
  state.searchTimer = setTimeout(() => commitSearch(searchInput.value), 380);
});

searchClear?.addEventListener("click", () => {
  clearTimeout(state.searchTimer);
  searchInput.value = "";
  toggleSearchClear();
  searchInput.focus();
  commitSearch("");
});

lbClose?.addEventListener("click", closeLightbox);
lightboxBackdrop?.addEventListener("click", closeLightbox);
lbPrev?.addEventListener("click", () => openLightbox(state.browse.index - 1));
lbNext?.addEventListener("click", () => openLightbox(state.browse.index + 1));

backTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
});

window.addEventListener("keydown", (e) => {
  const open = lightbox && !lightbox.hidden;
  const tag = e.target?.tagName || "";
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable;

  if (open) {
    if (e.key === "Tab") {
      const focusable = [
        ...lightbox.querySelectorAll(
          'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => !el.hidden && el.getAttribute("aria-hidden") !== "true");
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeLightbox();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      openLightbox(state.browse.index - 1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      openLightbox(state.browse.index + 1);
      return;
    }
  }

  if (typing) return;

  if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    searchInput?.focus();
    searchInput?.select();
    return;
  }

  if (!open && (e.key === "[" || e.key === "]")) {
    const r = parseHash();
    if (r.view !== "list") return;
    if (e.key === "[" && r.page > 1) {
      e.preventDefault();
      location.hash = listHash({ ...r, page: r.page - 1 });
    } else if (e.key === "]") {
      e.preventDefault();
      location.hash = listHash({ ...r, page: r.page + 1 });
    }
  }
});

/* headroom + back-to-top */
window.addEventListener(
  "scroll",
  () => {
    if (state.scrollTick) return;
    state.scrollTick = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || 0;
      if (y > 4) chromeEl.classList.add("scrolled");
      else chromeEl.classList.remove("scrolled");

      const delta = y - state.lastScrollY;
      if (y < 80) chromeEl.classList.remove("hidden");
      else if (delta > 8) chromeEl.classList.add("hidden");
      else if (delta < -8) chromeEl.classList.remove("hidden");

      if (backTop) backTop.hidden = y < 520;
      state.lastScrollY = y;
      state.scrollTick = false;
    });
  },
  { passive: true }
);

/* ---------------- router ---------------- */

async function route() {
  let r = parseHash();
  // normalize empty hash
  if (!location.hash || location.hash === "#" || location.hash === "#/") {
    // keep query if any
    if (!location.hash.includes("?")) {
      history.replaceState(null, "", listHash(r));
      r = parseHash();
    }
  }

  if (r.view === "detail") return renderDetail(r);
  return renderList(r);
}

wireMainTabs();
wireFilterSegs();
wireChromeActions();
window.addEventListener("hashchange", route);
route();
