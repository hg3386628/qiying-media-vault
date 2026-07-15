import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchUpstream,
  healthResponse,
  hostAllowed,
  md5browser,
  rewritePlaylist,
  signVideoUrl,
} from "../cloudflare/worker.js";


test("health endpoint reports the requested hostname for custom-domain verification", async () => {
  const response = healthResponse(new Request("https://media.example.com/api/health"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "qiying-media-vault",
    host: "media.example.com",
    colo: null,
  });

  const head = healthResponse(
    new Request("https://media.example.com/api/health", { method: "HEAD" })
  );
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});


test("MD5 signing matches the browser implementation", () => {
  assert.equal(md5browser("hello"), "5d41402abc4b2a76b9719d911017c592");
  const signed = signVideoUrl("/demo/video.m3u8", "https://hls.ffxddn.cn");
  assert.match(signed, /^https:\/\/hls\.ffxddn\.cn\/demo\/video\.m3u8\?auth_key=/);
  assert.match(signed, /&v=3&time=0$/);
});

test("proxy allowlist rejects unrelated hosts", () => {
  const allowed = new Set(["example.com"]);
  assert.equal(hostAllowed("https://cdn.example.com/file", allowed), true);
  assert.equal(hostAllowed("https://example.com.evil.test/file", allowed), false);
});

test("playlist rewrite keeps tags and proxies media URLs", () => {
  const output = rewritePlaylist(
    '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="crypt.key"\nsegment-1.ts\n',
    "https://hls.ffxddn.cn/path/index.m3u8",
    "https://qiying.example/api/hls?path=x"
  );
  assert.match(output, /URI="https:\/\/qiying\.example\/api\/proxy\?url=/);
  assert.match(output, /https:\/\/qiying\.example\/api\/proxy\?url=/);
  assert.match(output, /segment-1\.ts/);
});

test("upstream redirects stay inside the allowlist and preserve HEAD", async () => {
  const originalFetch = globalThis.fetch;
  const methods = [];
  try {
    globalThis.fetch = async (_url, init) => {
      methods.push(init.method);
      return new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/internal" },
      });
    };
    await assert.rejects(
      fetchUpstream(
        "https://cdn.example.com/file",
        new Request("https://worker.example/api/proxy", { method: "HEAD" }),
        1_000,
        new Set(["example.com"])
      ),
      /redirect host not allowed/
    );
    assert.deepEqual(methods, ["HEAD"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
