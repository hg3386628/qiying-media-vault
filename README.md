# 栖影（Qiying Media Vault）

栖影是一个面向大规模图片与 HLS 视频数据的静态媒体浏览站点，提供帖子检索、瀑布流浏览、沉浸式视频播放和媒体详情预览。项目采用预构建分片数据与按需加载策略，可部署到 Cloudflare Workers 或 GitHub Pages。

## 在线访问

- Cloudflare Workers（完整功能）：[qiying-media-vault.cfmxy123.workers.dev](https://qiying-media-vault.cfmxy123.workers.dev/)
- Cloudflare 自定义域名：[media.example.com](https://media.example.com/)
- GitHub Pages（静态版本）：[hg3386628.github.io/qiying-media-vault](https://hg3386628.github.io/qiying-media-vault/)
- 项目仓库：[github.com/hg3386628/qiying-media-vault](https://github.com/hg3386628/qiying-media-vault)

> Cloudflare Workers 版本包含同源媒体代理，能够更稳定地处理图片回退与 HLS 播放。GitHub Pages 版本直接访问上游 CDN，视频可用性取决于上游跨域策略。

## 核心能力

- 帖子浏览：支持随机、热度、分类、标签、媒体类型和全文搜索。
- 图片模式：瀑布流无限加载，支持 100%–300% 显示比例和大图预览。
- 视频模式：纵向沉浸式 HLS Feed，支持连续浏览。
- 详情预览：按帖子展示图片与视频宫格，并支持键盘切换媒体。
- 分片加载：目录、详情、图片和视频数据独立切片，降低首屏传输体积。
- 双平台部署：同时支持 Cloudflare Workers 与 GitHub Pages。
- 无障碍动效：使用渐进式动画，并遵守 `prefers-reduced-motion` 设置。

## 数据规模

| 指标 | 数量 |
|------|-----:|
| 帖子 | 21,259 |
| 有效标题 | 2,273 |
| 图片 | 41,702 |
| 帖子视频 | 9,425 |
| 独立视频记录 | 1,495 |

帖子以 `pid` 聚合，原始内容地址格式为 `https://www.91cg1.com/archives/{pid}/`。无标题纯图片内容归入“全部图片”，无标题视频内容归入“其他视频”。

## 快速开始

### 本地开发

```bash
python3 server.py
```

打开 [http://127.0.0.1:8787/](http://127.0.0.1:8787/) 即可访问开发版本。

### 预览部署产物

```bash
python3 scripts/build_site.py
SITE_ROOT=dist python3 server.py
```

构建结果位于 `dist/`，本地预览地址同样为 [http://127.0.0.1:8787/](http://127.0.0.1:8787/)。

## 页面与交互

### 内容模式

| 页面 | 说明 |
|------|------|
| 帖子 | 展示有标题的帖子卡片，支持筛选、搜索与分页 |
| 全部图片 | 展示无标题纯图片内容，采用瀑布流与无限加载 |
| 其他视频 | 展示无标题视频内容，采用纵向沉浸式 HLS Feed |

### 路由

| 路由 | 说明 |
|------|------|
| `#/` | 帖子列表 |
| `#/?q=&p=&ps=&kind=&cat=&tag=` | 带搜索、分页和筛选参数的帖子列表 |
| `#/?cat=其他图片` | 全部图片瀑布流 |
| `#/?cat=其他视频` | 其他视频 Feed |
| `#/post/<pid>` | 帖子详情与媒体宫格 |

### 搜索与筛选

- 媒体类型：全部、仅图片、仅视频、图片与视频。
- 分类：来自帖子元数据的 `categories` 字段。
- 标签：来自本地抓取并合并的 `tags` 字段。
- 搜索：匹配标题、标签、作者、`pid`、描述和日期。

### 快捷键

| 按键 | 功能 |
|------|------|
| `/` | 聚焦搜索框 |
| `Esc` | 关闭媒体预览 |
| `←` / `→` | 切换上一项或下一项媒体 |
| `[` / `]` | 切换上一页或下一页 |

### 动效

项目内置 [anime.js v4](https://animejs.com/documentation/getting-started/)，用于卡片、瀑布流、详情宫格和预览层的过渡效果。本地资源不可用时会回退至 jsDelivr；启用“减少动态效果”的系统环境将跳过 JavaScript 动画。

## 数据架构与性能

源数据由 `media-data/posts.json` 和 `media-data/post_meta.json` 构建。前端不直接加载完整源文件，而是通过 `dist/media-data/v2/manifest.json` 获取分片清单并按页面需求加载数据。

| 数据集 | 用途 | 分片数量 |
|--------|------|---------:|
| `catalog/` | 全站轻量目录与首屏列表 | 22 |
| `details/` | 帖子详情，按 `pid % 96` 分桶 | 96 |
| `modes/images/` | 全部图片模式 | 16 |
| `modes/videos/` | 其他视频模式 | 9 |

构建过程会为每个 JSON 文件生成确定性的 `.json.gz` 文件。浏览器优先加载 gzip 版本，不支持时自动回退到普通 JSON。

- catalog gzip 总量约 **0.57 MB**。
- 部署数据总量约 **16 MB**，同时包含普通 JSON 与 gzip 文件。
- 原始 `media-data/` 约 **78 MB**，不会随部署产物发布。
- 最大 catalog 原始分片约 **504 KB**，最大详情桶约 **71 KB**。

## 媒体代理架构

Cloudflare Worker 与本地服务提供统一的媒体代理接口：

- `/api/img`：校验目标域名并代理图片请求。
- `/api/hls`：获取已签名的 HLS 播放列表，并将其中的密钥与视频分片地址改写为同源代理地址。
- `/api/proxy`：代理 HLS 密钥与媒体分片，降低跨域限制和上游访问策略对播放的影响。

代理端仅允许访问配置的上游域名。签名逻辑由客户端封装，具体参数不在文档中公开。

## 构建与验证

### 构建静态站点

```bash
python3 scripts/build_site.py
```

构建脚本只将生产环境所需的页面、资源和分片数据写入 `dist/`。

### 运行检查

```bash
python3 -m unittest tests/test_build_site.py
node --test tests/worker.test.mjs
node --check app.js
node --check cloudflare/worker.js
```

## 部署

### Cloudflare Workers

Cloudflare Workers 是推荐的完整功能部署方式。Worker 同时托管 `dist/` 静态资源并提供媒体代理接口。

```bash
python3 scripts/build_site.py
CLOUDFLARE_API_TOKEN=你的令牌 npx wrangler deploy
```

部署配置位于 `wrangler.jsonc`，Worker 名称为 `qiying-media-vault`。

Worker 提供 `/api/health` 健康检查，用于确认自定义域名是否正确命中当前服务。自定义域名、DNSPod 分线路 CNAME、验证和回退步骤请参考 [Cloudflare Worker 自定义域名指南](docs/cloudflare-custom-domain.md)。

### GitHub Pages

推送到 `main` 分支后，[`.github/workflows/pages.yml`](.github/workflows/pages.yml) 会自动执行测试、构建 `dist/` 并发布 GitHub Pages。静态资源均使用相对路径，可兼容根路径和 `/<repo>/` 项目子路径。

GitHub Pages 不提供服务端代理，因此图片与视频会直接请求上游 CDN。图片通常可以正常浏览；HLS 是否可播放取决于上游 CDN 的 CORS 和访问控制策略。对视频播放稳定性有要求时，请使用 Cloudflare Workers 版本。

## 数据维护

### 主要数据文件

| 文件 | 说明 |
|------|------|
| `media-data/posts.json` | 按 `pid` 聚合的构建源，包含图片、视频及可选元数据 |
| `media-data/post_meta.json` | 从源站抓取的标题、分类和标签等元数据 |
| `media-data/images_*.json` | 原始图片扁平导出，前端不直接读取 |
| `media-data/media_videos.json` | 原始媒体视频记录 |
| `media-data/videos.json` | 独立视频记录，当前主界面不直接使用 |
| `dist/media-data/v2/manifest.json` | 部署数据入口与分片描述 |

### 更新帖子元数据

```bash
# 并发抓取
python3 scrape_post_meta.py --workers 12

# 仅重试缺失数据
python3 scrape_post_meta.py --only-missing
```

抓取完成后，需要将结果重新合并到 `posts.json`，再执行站点构建。源站部分 `pid` 已不可访问，元数据抓取未命中属于预期情况。

## 项目结构

```text
cdn-data/
├── .github/workflows/pages.yml  # GitHub Pages 自动部署
├── cloudflare/worker.js         # Cloudflare Worker 与媒体代理
├── docs/                        # 部署与运维文档
├── media-data/                  # 原始数据与构建源
├── scripts/build_site.py        # 生产数据分片与静态站点构建
├── scripts/verify_worker_domain.sh # 自定义域名 DNS、TLS 与健康检查
├── tests/                       # 构建及 Worker 测试
├── vendor/                      # 本地前端依赖
├── app.js                       # 页面逻辑与数据加载
├── index.html                   # 应用入口
├── server.py                    # 本地静态服务与媒体代理
├── styles.css                   # 视觉样式
└── wrangler.jsonc               # Cloudflare 部署配置
```

## 致谢

感谢 [LINUX DO 社区](https://linux.do/) 提供开放、友善的技术交流环境与经验分享。
## 说明

## 已知限制

- GitHub Pages 无法承载服务端媒体代理，HLS 播放能力受上游 CDN 跨域策略影响。
- 部分源站帖子已失效，无法补全标题、标签等元数据。
- 图片显示比例保存在浏览器 `localStorage` 的 `posts.imageSize` 键中，范围为 100–300，步进为 10。
