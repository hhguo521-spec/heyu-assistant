import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export class HttpError extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function send(res, status, data) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

export function guard(req, res, method, env = process.env) {
  const supplied = req.headers["x-access-code"];
  const digest = (value) => createHash("sha256").update(value).digest();
  if (!env.ACCESS_CODE)
    throw new HttpError(503, "服务尚未配置访问口令，请联系管理员。");
  if (
    typeof supplied !== "string" ||
    !timingSafeEqual(digest(supplied), digest(env.ACCESS_CODE))
  ) {
    throw new HttpError(401, "口令不正确，请重新输入。");
  }
  if (req.method !== method) {
    res.setHeader("Allow", method);
    throw new HttpError(405, "不支持的请求方式。");
  }
  if (!env.DIFY_API_KEY)
    throw new HttpError(503, "生成服务尚未配置，请联系管理员。");
}

export function fail(res, error) {
  if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
  send(res, error instanceof HttpError ? error.status : 502, {
    error:
      error instanceof HttpError
        ? error.message
        : "暂时无法连接生成服务，请稍后重试。",
  });
}

export function clientIP(req, env = process.env) {
  // Only Vercel's overwritten header is trusted in production; local clients cannot spoof it.
  const value = env.VERCEL
    ? req.headers["x-vercel-forwarded-for"]
    : req.socket?.remoteAddress;
  let ip = typeof value === "string" ? value.split(",")[0].trim() : "";
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (!isIP(ip)) throw new HttpError(503, "暂时无法识别访问来源，请稍后重试。");
  return ip;
}

export function apiBase(env = process.env) {
  const url = new URL(env.DIFY_API_BASE_URL || "https://api.dify.ai/v1");
  const localHTTP =
    url.protocol === "http:" &&
    !env.VERCEL &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !localHTTP)
  ) {
    throw new HttpError(503, "Dify API 地址配置无效。");
  }
  return url.href.replace(/\/$/, "");
}

export async function readBody(req) {
  if (
    !String(req.headers["content-type"] || "")
      .toLowerCase()
      .startsWith("application/json")
  ) {
    throw new HttpError(415, "请使用 JSON 格式提交。");
  }
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 8192) throw new HttpError(413, "提交内容过长。");
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (
    Buffer.byteLength(
      typeof body === "string" ? body : JSON.stringify(body) || "",
    ) > 8192
  ) {
    throw new HttpError(413, "提交内容过长。");
  }
  try {
    return typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    throw new HttpError(400, "提交的 JSON 格式无效。");
  }
}

export function validateInputs(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "请填写生成需求。");
  const products = [
    "T20 Pro 月白",
    "T20 Pro 曜石黑",
    "T10 月白",
    "S1 Max 标准版",
    "S1 Max 上下水版",
  ];
  const wants = ["文案 + 配图 + 视频", "文案 + 配图", "只要文案"];
  if (!products.includes(body.product))
    throw new HttpError(400, "请选择列表中的商品。");
  if (!wants.includes(body.want))
    throw new HttpError(400, "请选择有效的生成内容。");
  const field = (name, label, max, fallback = "") => {
    const value = body[name] ?? fallback;
    if (typeof value !== "string" || [...value.trim()].length > max)
      throw new HttpError(400, `${label}最多 ${max} 字。`);
    return value.trim();
  };
  const audience = field("audience", "目标人群", 60);
  if (!audience) throw new HttpError(400, "请填写目标人群。");
  return {
    product: body.product,
    campaign: field("campaign", "活动", 20, "双 11") || "双 11",
    audience,
    want: body.want,
    shot: field("shot", "视频镜头要求", 500),
  };
}

export const validId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
