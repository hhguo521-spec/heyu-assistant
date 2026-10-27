# 禾予 · 种草助手

交互式液态 H / Y 首页与 Dify 内容创作工具。支持小红书笔记、抖音口播、详情页文案，以及配图和视频展示。

## 部署

- GitHub Pages 托管 `public/` 网页，仓库变量 `PUBLIC_API_BASE_URL` 指向 Netlify 后端的 HTTPS 域名。
- GitHub Settings → Pages → Source 选择 GitHub Actions。推送 main 或手动运行 Publish GitHub Pages 发布。
- Netlify 从本仓库构建，`netlify.toml` 配置网页和 `/api/start`、`/api/status` 接口。
- Netlify 服务端环境变量：`DIFY_API_KEY`、`ACCESS_CODE`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`ALLOWED_ORIGINS`。
- `ALLOWED_ORIGINS` 填 GitHub Pages 的 origin，例如 `https://你的用户名.github.io`，不含仓库路径；多个来源用逗号分隔。
- 如果沿用 Vercel Marketplace 的 Redis，可使用 `KV_REST_API_URL`、`KV_REST_API_TOKEN` 代替对应的 Upstash 变量。
- 配置变量后重新部署。GitHub Pages 未配置后端时会明确提示，不能生成。

## 安全

密钥仅保存在后端环境变量，不能写进代码、GitHub 仓库、Pages 变量或网页。两接口均验证访问口令，Redis 对每个 IP 实施十分钟六次的滑动窗口限制。结果文字以 textContent 渲染，媒体地址限制为 HTTPS。

## 本地验证

```sh
npm test
npm run build
npm run build:pages
```

需要本地联调时，复制 `.env.example` 为 `.env.local` 并填入自己的服务端配置，再执行 `npm run dev`。本地内存限流仅供开发；生产必须配置 Redis。
