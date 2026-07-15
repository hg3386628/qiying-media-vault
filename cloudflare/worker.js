const IMG_PUBLIC = "https://imgpublic.ycomesc.live";
const HLS_KEY = "RnOxyCIc5eDPFpJY";
const VIDEO_BASES = ["https://hls.ffxddn.cn", "https://op.vkjyoi.cn"];

const IMAGE_HOSTS = new Set([
  "imgpublic.ycomesc.live",
  "pic.jjlxoi.cn",
  "pic.uforxk.cn",
  "image.qzycbu.cn",
  "new.qzycbu.cn",
  "pwa.eisees.com",
]);

const VIDEO_HOSTS = new Set([
  "hls.ffxddn.cn",
  "op.vkjyoi.cn",
  "qw.bgqpnx.cn",
  "as.bgqpnx.cn",
  "ts.hhjd.mobi",
  "ts.syjiaotong.mobi",
  "tts.doudou520.online",
  "syjiaotong.mobi",
  "hhjd.mobi",
  "bgqpnx.cn",
  "vkjyoi.cn",
  "ffxddn.cn",
  "doudou520.online",
]);

const PROXY_HOSTS = new Set([...IMAGE_HOSTS, ...VIDEO_HOSTS]);

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    ...extra,
  };
}

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json; charset=utf-8" }),
  });
}

function healthResponse(request) {
  const url = new URL(request.url);
  const body = request.method === "HEAD"
    ? null
    : JSON.stringify({
        ok: true,
        service: "qiying-media-vault",
        host: url.host,
        colo: request.cf?.colo || null,
      });
  return new Response(body, {
    status: 200,
    headers: corsHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    }),
  });
}

function hostAllowed(rawUrl, allowedHosts) {
  let hostname;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  for (const allowed of allowedHosts) {
    if (hostname === allowed || hostname.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

function pathOnly(raw) {
  let value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return "";
    }
  }
  if (!value.startsWith("/")) value = `/${value}`;
  return value.split("?", 1)[0].split("#", 1)[0];
}

function md5browser(str) {
  function cmn(q, a, b, x, s, t) {
    a = (a + q + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  const ff = (a, b, c, d, x, s, t) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a, b, c, d, x, s, t) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a, b, c, d, x, s, t) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a, b, c, d, x, s, t) => cmn(c ^ (b | ~d), a, b, x, s, t);
  function block(s) {
    const out = [];
    for (let i = 0; i < 64; i += 4) {
      out[i >> 2] =
        s.charCodeAt(i) +
        (s.charCodeAt(i + 1) << 8) +
        (s.charCodeAt(i + 2) << 16) +
        (s.charCodeAt(i + 3) << 24);
    }
    return out;
  }
  function cycle(state, k) {
    let [a, b, c, d] = state;
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784); c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463); c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353); c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222); c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835); c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744); c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379); c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    state[0] = (a + state[0]) | 0; state[1] = (b + state[1]) | 0; state[2] = (c + state[2]) | 0; state[3] = (d + state[3]) | 0;
  }
  const encoded = unescape(encodeURIComponent(str));
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let i;
  for (i = 64; i <= encoded.length; i += 64) cycle(state, block(encoded.substring(i - 64, i)));
  const tailText = encoded.substring(i - 64);
  const tail = Array(16).fill(0);
  for (i = 0; i < tailText.length; i++) tail[i >> 2] |= tailText.charCodeAt(i) << ((i % 4) << 3);
  tail[i >> 2] |= 0x80 << ((i % 4) << 3);
  if (i > 55) { cycle(state, tail); tail.fill(0); }
  tail[14] = encoded.length * 8;
  cycle(state, tail);
  return state.map((word) => {
    let out = "";
    for (let j = 0; j < 4; j++) {
      out += ((word >> (j * 8 + 4)) & 15).toString(16);
      out += ((word >> (j * 8)) & 15).toString(16);
    }
    return out;
  }).join("");
}

function signVideoUrl(rawPath, base = VIDEO_BASES[0]) {
  const path = pathOnly(rawPath);
  if (!path) return "";
  const now = Math.floor(Date.now() / 1000);
  const rand = md5browser(`${path}${now}`).slice(0, 13);
  const sign = md5browser(`${path}-${now}-${rand}-0-${HLS_KEY}`);
  return `${base.replace(/\/$/, "")}${path}?auth_key=${now}-${rand}-0-${sign}&v=3&time=0`;
}

async function fetchUpstream(url, request, timeoutMs = 25_000, allowedHosts = PROXY_HOSTS) {
  const headers = new Headers({
    Accept: "*/*",
    Referer: "https://www.91cg1.com/",
    Origin: "https://www.91cg1.com",
    "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/126 Safari/537.36",
  });
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop < 5; hop += 1) {
      if (!hostAllowed(current, allowedHosts)) throw new Error("redirect host not allowed");
      const response = await fetch(current, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return { response, url: current };
      }
      const location = response.headers.get("Location");
      if (!location) return { response, url: current };
      current = new URL(location, current).href;
    }
    throw new Error("too many upstream redirects");
  } finally {
    clearTimeout(timer);
  }
}

function responseFromUpstream(upstream, body = upstream.body, cacheControl = "public, max-age=300") {
  const headers = corsHeaders({
    "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
    "Cache-Control": cacheControl,
  });
  for (const name of ["Accept-Ranges", "Content-Range", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  return new Response(body, { status: upstream.status, headers });
}

function proxyUrl(raw, requestUrl) {
  const url = new URL("/api/proxy", requestUrl);
  url.searchParams.set("url", raw);
  return url.href;
}

function rewritePlaylist(text, baseUrl, requestUrl) {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      if (line.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_, raw) => {
          const absolute = new URL(raw, baseUrl).href;
          return `URI="${proxyUrl(absolute, requestUrl)}"`;
        });
      }
      return proxyUrl(new URL(line.trim(), baseUrl).href, requestUrl);
    })
    .join("\n");
}

async function handleImage(request, url) {
  const raw = url.searchParams.get("url") || "";
  if (!raw) return errorResponse(400, "missing url");
  if (!hostAllowed(raw, IMAGE_HOSTS)) return errorResponse(403, "host not allowed");
  const parsed = new URL(raw);
  const primary = parsed.hostname === "imgpublic.ycomesc.live" ? raw : `${IMG_PUBLIC}${parsed.pathname}`;
  let result = await fetchUpstream(primary, request, 20_000, IMAGE_HOSTS);
  if (!result.response.ok && primary !== raw) {
    result = await fetchUpstream(raw, request, 20_000, IMAGE_HOSTS);
  }
  const upstream = result.response;
  return responseFromUpstream(upstream, request.method === "HEAD" ? null : upstream.body, "public, max-age=86400");
}

async function signedUpstream(path, hostPreference, request) {
  const bases = [...VIDEO_BASES];
  if (hostPreference) {
    const preferred = hostPreference.startsWith("http") ? hostPreference : `https://${hostPreference}`;
    if (hostAllowed(preferred, VIDEO_HOSTS)) bases.unshift(preferred.replace(/\/$/, ""));
  }
  let last = null;
  for (const base of [...new Set(bases)]) {
    const signed = signVideoUrl(path, base);
    const result = await fetchUpstream(signed, request, 35_000, VIDEO_HOSTS);
    last = result;
    if (result.response.ok) return result;
  }
  return last;
}

async function handleProxy(request, url) {
  const raw = url.searchParams.get("url") || "";
  const mediaPath = url.searchParams.get("path") || "";
  let target = raw;
  let upstream;
  if (!target && mediaPath) {
    const result = await signedUpstream(mediaPath, url.searchParams.get("host") || "", request);
    if (!result) return errorResponse(502, "upstream unavailable");
    ({ response: upstream, url: target } = result);
  }
  if (!target) return errorResponse(400, "missing url or path");
  if (!hostAllowed(target, PROXY_HOSTS)) return errorResponse(403, "host not allowed");
  if (!upstream) {
    const result = await fetchUpstream(target, request, 45_000, PROXY_HOSTS);
    upstream = result.response;
    target = result.url;
  }
  const contentType = upstream.headers.get("Content-Type") || "";
  const isPlaylist = contentType.includes("mpegurl") || new URL(target).pathname.endsWith(".m3u8");
  if (!isPlaylist) return responseFromUpstream(upstream, request.method === "HEAD" ? null : upstream.body);
  if (request.method === "HEAD") {
    return new Response(null, {
      status: upstream.status,
      headers: corsHeaders({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      }),
    });
  }
  const text = await upstream.text();
  const rewritten = rewritePlaylist(text, target, request.url);
  return new Response(request.method === "HEAD" ? null : rewritten, {
    status: upstream.status,
    headers: corsHeaders({
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store",
    }),
  });
}

async function handleHls(request, url) {
  const mediaPath = url.searchParams.get("path") || "";
  const raw = url.searchParams.get("url") || "";
  let target = raw;
  let upstream;
  if (mediaPath && !raw) {
    if (/\.(mp4|webm|mov)$/i.test(pathOnly(mediaPath))) {
      return errorResponse(415, "not an HLS playlist");
    }
    const result = await signedUpstream(mediaPath, url.searchParams.get("host") || "", request);
    if (!result) return errorResponse(502, "upstream unavailable");
    ({ response: upstream, url: target } = result);
  }
  if (!target) return errorResponse(400, "missing url or path");
  if (!hostAllowed(target, VIDEO_HOSTS)) return errorResponse(403, "host not allowed");
  if (!upstream) {
    const result = await fetchUpstream(target, request, 30_000, VIDEO_HOSTS);
    upstream = result.response;
    target = result.url;
  }
  if (request.method === "HEAD") {
    return new Response(null, {
      status: upstream.status,
      headers: corsHeaders({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      }),
    });
  }
  const text = await upstream.text();
  if (!upstream.ok || !text.trimStart().startsWith("#EXTM3U")) {
    return errorResponse(upstream.status || 502, "upstream playlist failed");
  }
  const rewritten = rewritePlaylist(text, target, request.url);
  return new Response(request.method === "HEAD" ? null : rewritten, {
    status: 200,
    headers: corsHeaders({
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store",
    }),
  });
}

export { fetchUpstream, healthResponse, hostAllowed, md5browser, rewritePlaylist, signVideoUrl };

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (!['GET', 'HEAD'].includes(request.method)) return errorResponse(405, "method not allowed");
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return healthResponse(request);
      if (url.pathname === "/api/img") return await handleImage(request, url);
      if (url.pathname === "/api/proxy") return await handleProxy(request, url);
      if (url.pathname === "/api/hls") return await handleHls(request, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return errorResponse(502, error instanceof Error ? error.message : "worker error");
    }
  },
};
