# 栖影

本地静态 **帖子中心** 媒体库（Immich / PhotoPrism 风格深色画廊）。

源数据镜像自 Netlify 导出 + 源站元数据抓取。

## 启动

```bash
cd cdn-data
python3 server.py
# http://127.0.0.1:8787/
```

部署产物预览：

```bash
python3 scripts/build_site.py
SITE_ROOT=dist python3 server.py
# http://127.0.0.1:8787/
```

## 界面

顶栏三个主 Tab：

| Tab | 说明 |
|-----|------|
| **帖子** | 有标题帖子卡片网格（随机 / 热度 / 分类 / 标签 / 搜索） |
| **全部图片** | 无标题仅图帖 · 瀑布流无限滚动 · 显示大小 100–300% · **点击预览大图**（不进详情） |
| **其他视频** | 无标题含视频帖 · 抖音式竖滑 HLS |

| 路由 | 说明 |
|------|------|
| `#/` · `#/?q=&p=&ps=&kind=&cat=&tag=` | 帖子列表 |
| `#/?cat=其他图片` | 全部图片瀑布流（路由 key 仍为「其他图片」） |
| `#/?cat=其他视频` | 其他视频 Feed |
| `#/post/<pid>` | 帖子详情 + 媒体宫格 |

### 帖子筛选

- **类型**：全部 / 仅图片 / 仅视频 / 图+视频
- **分类**：来自 `post_meta` 的 categories 芯片（「全部」= 有标题随机）
- **标签**：本地抓取 tags
- **搜索**：标题、标签、作者、pid、描述、日期（`/` 聚焦）

### 快捷键

| 键 | 作用 |
|----|------|
| `/` | 聚焦搜索 |
| `Esc` | 关闭预览 |
| `←` `→` | 预览内切换媒体 |
| `[` `]` | 上一页 / 下一页 |

### 动效

使用本地 [anime.js v4](https://animejs.com/documentation/getting-started/)（`vendor/anime.iife.min.js`，失败时回退 jsDelivr）：

- 帖子卡片网格 / 瀑布流批次 / 详情媒体宫格：stagger 入场
- 预览 lightbox 打开与媒体切换：scale + fade
- 空态 / 错误态：轻微弹入
- 遵守 `prefers-reduced-motion: reduce`（直接跳过 JS 动效）

## 数据

| 文件 | 说明 |
|------|------|
| `media-data/posts.json` | 构建源，按 `pid` 聚合图片/视频 + 可选标题/标签 |
| `media-data/post_meta.json` | 源站抓取结果（已 merge 进 posts） |
| `media-data/images_*.json` 等 | 原始扁平导出（UI 不再直接读） |
| `dist/media-data/v2/manifest.json` | 部署数据入口，描述 catalog、详情桶和媒体模式分片 |

统计（导出 + 抓取后）：

- 帖子 **21,259**
- 有效标题 **2,273** → **帖子** Tab（另有 1 条标题为“未命名文档”）
- 无标题仅图 → **全部图片** · 无标题含视频 → **其他视频**
- 图片 41,702 · 帖子视频 9,425 · 独立视频表 1,495（表仍在磁盘，主 UI 不用）

分组键 = **`pid`** ≈ `https://www.91cg1.com/archives/{pid}/`。

## CDN

- 图片：`https://imgpublic.ycomesc.live`（备用域名经 `/api/img` 改写；本地缓存优先）
- 视频 HLS：签名后走 `/api/hls` 拉 playlist，再把 `crypt.key` / `.ts` 改写到 `/api/proxy`（同源，规避多 CDN CORS/403）
- 签名：`signVideoClient()` · `HLS_KEY = RnOxyCIc5eDPFpJY` · 主域名 `hls.ffxddn.cn`，失败回退 `op.vkjyoi.cn`

## 目录

```text
cdn-data/
├── index.html
├── styles.css
├── app.js
├── server.py
├── scripts/
│   └── build_site.py
├── cloudflare/
│   └── worker.js
├── wrangler.jsonc
├── scrape_post_meta.py
├── vendor/
│   ├── hls.min.js
│   └── anime.iife.min.js
└── media-data/
    ├── posts.json
    ├── post_meta.json
    ├── meta.json
    ├── images_000.json …
    ├── media_videos.json
    └── videos.json
```

## 数据构建与 gzip

```bash
python3 scripts/build_site.py
```

构建只把部署必需内容写入 `dist/`，不会发布原始导出文件：

- `catalog/`：全站轻量索引，22 个分片，首屏 gzip 总量约 **0.57MB**。
- `details/`：按 `pid % 96` 分桶，进入详情时只加载一个桶。
- `modes/images/`：进入“全部图片”时加载，16 个分片。
- `modes/videos/`：进入“其他视频”时加载，9 个分片。
- 每个 `.json` 都生成确定性的 `.json.gz`；浏览器优先下载 gzip，并在不支持时回退普通 JSON。

当前部署数据约 **16MB**（同时包含普通 JSON 与 gzip），原始 `media-data` 约 78MB。最大单个 catalog 原始分片约 504KB，详情桶最大约 71KB。

验证：

```bash
python3 -m unittest tests/test_build_site.py
node --test tests/worker.test.mjs
node --check app.js
node --check cloudflare/worker.js
```

## 部署

### Cloudflare Workers

Cloudflare 是完整功能版本。Worker 同时托管 `dist/`，并提供受域名白名单限制的 `/api/img`、`/api/hls`、`/api/proxy`，因此图片回退和 HLS 播放与本地服务一致。

```bash
python3 scripts/build_site.py
CLOUDFLARE_API_TOKEN=你的令牌 npx wrangler deploy
```

配置位于 `wrangler.jsonc`，Worker 名称为 `qiying-media-vault`。

### GitHub Pages

推送到 `main` 后，[`.github/workflows/pages.yml`](.github/workflows/pages.yml) 会运行测试、重新构建 `dist/` 并部署 GitHub Pages。静态资源使用相对路径，因此同时支持用户站点和 `/<repo>/` 项目子路径。

GitHub Pages 没有服务端代理，页面会改为直接请求图片和签名后的视频 CDN。图片浏览通常可用；HLS 是否可播取决于上游 CDN 的跨域策略。需要稳定视频播放时使用 Cloudflare 地址。

## 抓取标题/标签

```bash
python3 scrape_post_meta.py --workers 12
# 重试失败：python3 scrape_post_meta.py --only-missing
```

成功后需重新 merge 进 `posts.json`（若你改过 merge 脚本再跑一遍；当前仓库内 posts 已含 merge 字段）。

## 图片缓存（移动硬盘）

约 5 万张图默认缓到 **`/Volumes/app/cdn-data-cache/images/`**（`app` 盘）：

```bash
# 试跑 50 张
python3 cache_images.py --limit 50 --workers 8

# 全量（可 Ctrl+C，下次自动跳过已下好的）
python3 cache_images.py --workers 12
```

- 目录布局：`cdn-data-cache/images/upload_01/upload/.../xxx.jpg`（保留 CDN path）
- `server.py` 的 `/api/img` **优先读本地缓存**，未命中再回源 CDN
- 换路径：`CDN_IMAGE_CACHE=/path/to/cache python3 server.py`
- 预计体积：按 ~100–200KB/张粗算约 **5–15GB**；硬盘剩余约 179GB

## 说明

1. JSON 已完整本地镜像；二进制媒体默认可走外部 CDN，缓存后优先本地。
2. 源站大量 pid 已 404，meta 命中率约一成属正常。
3. 本地 `server.py` 提供静态文件 + `/api/img` / `/api/proxy`。
4. 全部图片显示大小存在 `localStorage` 键 `posts.imageSize`（100–300，步进 10）。
