#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "用法: $0 <自定义域名>" >&2
  echo "示例: $0 media.example.com" >&2
  exit 64
fi

if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || [[ "$DOMAIN" != *.* ]]; then
  echo "无效域名: $DOMAIN" >&2
  exit 64
fi

for command in dig openssl curl python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "缺少命令: $command" >&2
    exit 69
  fi
done

echo "[1/4] 权威 DNS 与公开解析"
echo "NS:"
dig +time=2 +tries=1 +short "$DOMAIN" NS || true
for resolver in 1.1.1.1 8.8.8.8 119.29.29.29; do
  echo "A @$resolver:"
  dig "@$resolver" +time=2 +tries=1 +short "$DOMAIN" A || true
  echo "CNAME @$resolver:"
  dig "@$resolver" +time=2 +tries=1 +short "$DOMAIN" CNAME || true
done

echo "[2/4] TLS 证书主机名"
if ! certificate="$({
    printf '' | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null
  } | openssl x509 -outform PEM 2>/dev/null)" || [[ -z "$certificate" ]]; then
  echo "无法读取 $DOMAIN 的 TLS 证书" >&2
  exit 1
fi

printf '%s\n' "$certificate" | openssl x509 -noout -subject -issuer -dates
printf '%s\n' "$certificate" | openssl x509 -noout -checkhost "$DOMAIN"

echo "[3/4] Worker 健康检查"
health="$(curl --fail --silent --show-error --location --max-time 20 "https://$DOMAIN/api/health")"
printf '%s\n' "$health"

HEALTH_JSON="$health" EXPECTED_HOST="$DOMAIN" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["HEALTH_JSON"])
expected = os.environ["EXPECTED_HOST"]
if payload.get("ok") is not True:
    raise SystemExit("健康检查未返回 ok=true")
if payload.get("service") != "qiying-media-vault":
    raise SystemExit("响应并非 qiying-media-vault Worker")
if payload.get("host") != expected:
    raise SystemExit(f"Worker 收到的 Host 为 {payload.get('host')!r}，预期 {expected!r}")
PY

echo "[4/4] 首页响应"
curl --fail --silent --show-error --head --location --max-time 20 "https://$DOMAIN/" | sed -n '1,12p'

echo "验证通过: https://$DOMAIN"
