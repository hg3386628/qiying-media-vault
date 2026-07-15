# Cloudflare Worker 自定义域名

本文说明栖影 Worker 的自定义域名接入方式，以及 DNSPod 分线路解析的适用边界。

## 当前采用的实验方案

当前按项目维护者要求，允许将自定义域名通过 DNSPod 分线路 CNAME 到 `qiying-media-vault.cfmxy123.workers.dev` 和经过验证的 Cloudflare 优选目标。该方式不属于 Cloudflare 官方支持路径，DNS CNAME 也不会改变浏览器发送的 TLS SNI 和 HTTP Host，因此依赖预先签发的证书和显式 Worker Route 继续生效。

上线前必须先通过 Worker Custom Domain 为 hostname 签发证书。证书 Active 后删除 Custom Domain 绑定，但不要手工删除对应的 Advanced Certificate；随后使用 Worker Route 将 `media.example.com/*` 路由到 `qiying-media-vault`。

Cloudflare 官方支持的方案如下：

| Cloudflare 套餐 | 权威 DNS | 推荐接入方式 |
|-----------------|----------|--------------|
| Free / Pro | Cloudflare | 整个域名使用 Cloudflare NS，通过 Worker Custom Domain 接入 |
| Free / Pro | DNSPod | 保留 `workers.dev`，或使用 GitHub Pages 独立域名；不支持官方自定义 Worker hostname |
| Business / Enterprise | DNSPod | 使用 Cloudflare Partial CNAME Setup，目标指向 Cloudflare 分配的 `.cdn.cloudflare.net` hostname |
| Enterprise | Cloudflare 子域 Zone | 将专用子域委派给 Cloudflare，在子域 Zone 内配置 Custom Domain |

> DNSPod 的 NS 委派与 Cloudflare 自动创建的 Worker Custom Domain DNS 记录不能共存，因此必须先签发证书，再删除 Custom Domain 绑定并改用 Worker Route。

## 实验方案：DNSPod 分线路 CNAME 到 workers.dev

以下统一使用 `media.example.com` 作为业务域名占位符，Worker 默认域名为 `qiying-media-vault.cfmxy123.workers.dev`。真实生产域名只保存在 Cloudflare、DNSPod 和本地私有配置中，不写入公开仓库。

### 1. 预先建立 Worker 域名绑定

在 Cloudflare Workers & Pages 中打开 `qiying-media-vault`，进入 **Settings > Domains & Routes**，确认 `media.example.com` 已绑定到当前 Worker，并等待证书状态变为 Active。

也可以在域名仍由 Cloudflare 管理时执行一次：

```bash
python3 scripts/build_site.py
npx wrangler deploy --domain media.example.com
```

证书生效后，从 Worker 的 **Domains & Routes** 中删除该 Custom Domain。Cloudflare 不会自动删除已经签发的 Advanced Certificate。

### 2. 建立 Worker Route

Custom Domain 删除后，为父 Zone 添加 Worker Route：

```jsonc
{
  "routes": [
    {
      "pattern": "media.example.com/*",
      "zone_name": "example.com"
    }
  ]
}
```

也可以通过 Cloudflare API 创建：

```json
{
  "pattern": "media.example.com/*",
  "script": "qiying-media-vault"
}
```

缺少这条 Route 时，默认 CNAME 会返回 Cloudflare `DNS points to prohibited IP` 错误。

### 3. 将专用子域委派给 DNSPod

1. 在 DNSPod 添加 `media.example.com`，按 DNSPod 提示在父 Zone `example.com` 添加 TXT 记录完成所有权验证。实际 TXT 名称以 DNSPod 控制台提示为准。
2. 记录 DNSPod 为该子域分配的 NS 地址。
3. 在父域当前的权威 DNS 中，删除 `media.example.com` 上与委派冲突的 A、AAAA 或 CNAME 记录。
4. 为 `media.example.com` 添加 DNSPod 提供的 NS 记录。
5. 等待 `dig NS media.example.com` 返回 DNSPod NS。

建议使用专用子域，不要委派承载邮件、验证记录或其他服务的主域。

### 4. 配置 DNSPod 分线路记录

先添加默认线路：

| 主机记录 | 记录类型 | 线路 | 目标 |
|----------|----------|------|------|
| `@` | CNAME | 默认 | `qiying-media-vault.cfmxy123.workers.dev` |

确认默认线路可以保存后，再添加境内线路：

| 主机记录 | 记录类型 | 线路 | 目标 |
|----------|----------|------|------|
| `@` | CNAME | 境内 | `qiying.cloudflare.182682.xyz` |

当前目标来自微测网 `*.cloudflare.182682.xyz` 通配符服务。每次更换目标后重新验证证书、首页和媒体代理。

### 5. 验证

部署包含 `/api/health` 的最新 Worker 后执行：

```bash
scripts/verify_worker_domain.sh media.example.com
```

浏览器中还需要分别测试：

- 首页、帖子详情和静态资源加载。
- 图片 `/api/img` 代理。
- HLS playlist、密钥与 `.ts` 分片代理。
- 中国大陆移动、联通和电信网络。
- 境外网络或公共 DNS。

`/api/health` 必须返回：

```json
{
  "ok": true,
  "service": "qiying-media-vault",
  "host": "media.example.com"
}
```

### 6. 回退

如果境内线路失败：

1. 删除 DNSPod 的“境内”CNAME，只保留默认线路。
2. 等待 DNSPod TTL 到期，再重新运行验证脚本。

如果默认线路也失败：

1. 删除父域中的 DNSPod NS 委派。
2. 删除 `media.example.com/*` Worker Route。
3. 将该 hostname 恢复为 Cloudflare 权威 DNS。
4. 重新执行 `npx wrangler deploy --domain media.example.com`。
5. 等待 Cloudflare DNS 与证书恢复后验证。

回退期间始终可以使用 `https://qiying-media-vault.cfmxy123.workers.dev/`。

## Free / Pro：整域接入 Cloudflare

这是免费套餐可用且最稳定的自定义域名方案。

1. 将目标域名添加到 Cloudflare，并在注册商处切换为 Cloudflare 提供的 NS。
2. 完成站点构建和测试。
3. 首次部署时通过 `--domain` 创建 Worker Custom Domain：

   ```bash
   python3 scripts/build_site.py
   node --test tests/worker.test.mjs
   npx wrangler deploy --domain media.example.com
   ```

4. 等待 Cloudflare 自动创建 DNS 记录和 Advanced Certificate。
5. 执行验证：

   ```bash
   scripts/verify_worker_domain.sh media.example.com
   ```

后续可以将精确域名写入 `wrangler.jsonc`：

```jsonc
{
  "routes": [
    {
      "pattern": "media.example.com",
      "custom_domain": true
    }
  ]
}
```

在确认实际域名之前，不要把示例 hostname 写入生产配置。

## Business / Enterprise：DNSPod + Partial CNAME Setup

Cloudflare Partial CNAME Setup 允许 DNSPod 继续作为权威 DNS，但该能力仅适用于 Business 和 Enterprise 套餐。

1. 在 Cloudflare 创建并验证 Partial Zone。
2. 为目标 hostname 配置 Worker Route。
3. Cloudflare 会提供形如 `media.example.com.cdn.cloudflare.net` 的目标 hostname。
4. 在 DNSPod 将业务域名 CNAME 到该 `.cdn.cloudflare.net` hostname，而不是 `workers.dev`。
5. 等待 Cloudflare 签发实际业务域名的证书，再运行验证脚本。

Worker Route 示例：

```jsonc
{
  "routes": [
    {
      "pattern": "media.example.com/*",
      "zone_name": "example.com"
    }
  ]
}
```

## 关于 DNSPod 境内优选线路

仅当所有目标都明确支持你的实际业务 hostname，并且证书的 Subject Alternative Name 包含该 hostname 时，才能进行分线路 CNAME。第三方优选域名会经过第三方维护的网络入口，存在可用性、证书续期、流量可见性和供应链风险，不应直接写入仓库。

上线前至少确认：

- 默认、境内和境外线路都返回相同的 Worker 健康检查结果。
- TLS 证书覆盖用户实际访问的精确 hostname。
- `/api/hls` 改写后的 `/api/proxy` 地址仍使用自定义域名。
- 删除任一分线路记录后，可以快速回退到默认 Cloudflare 入口。
- Cloudflare API Token 只保存在本地密钥存储或 CI Secret 中，不进入代码、README、提交记录或终端截图。

## 验证与排障

```bash
scripts/verify_worker_domain.sh media.example.com
```

脚本会检查：

1. Cloudflare、Google 和 DNSPod 公共解析器返回的 A/CNAME 记录。
2. TLS 证书是否匹配实际 hostname。
3. `/api/health` 是否由 `qiying-media-vault` Worker 返回。
4. 首页是否能够通过 HTTPS 正常访问。

如果证书或健康检查失败，应先删除境内优选记录，只保留官方默认目标。不要通过关闭 HTTPS 校验或使用 `curl -k` 掩盖证书问题。

## 官方文档

- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [CNAME setup (Partial)](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)
- [Subdomain setup](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)
- [Universal SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)
