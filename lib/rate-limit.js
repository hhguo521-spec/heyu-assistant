import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "./common.js";

export const WINDOW = 600_000;
export const LIMIT = 6;
const buckets = new Map();

// A single atomic sliding-window operation shared by every Vercel instance.
export const RATE_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000))}
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], window)
return {1, 0}
`;

export function localLimit(ip, now = Date.now(), map = buckets) {
  for (const [key, hits] of map)
    if (hits.at(-1) <= now - WINDOW) map.delete(key);
  const hits = (map.get(ip) || []).filter((t) => t > now - WINDOW);
  if (hits.length >= LIMIT)
    return [0, Math.max(1, Math.ceil((hits[0] + WINDOW - now) / 1000))];
  hits.push(now);
  map.set(ip, hits);
  return [1, 0];
}

export async function rateLimit(
  ip,
  { env = process.env, fetchImpl = fetch } = {},
) {
  let result;
  if (
    !env.VERCEL &&
    env.NODE_ENV !== "production" &&
    env.LOCAL_MEMORY_RATE_LIMIT === "true"
  ) {
    result = localLimit(ip);
  } else {
    // The Vercel Marketplace integration uses KV_* names by default.
    const directConfig = env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN;
    const redisUrl = directConfig ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL;
    const redisToken = directConfig ? env.UPSTASH_REDIS_REST_TOKEN : env.KV_REST_API_TOKEN;
    if (!redisUrl || !redisToken) {
      throw new HttpError(503, "访问频率服务尚未配置，请联系管理员。");
    }
    try {
      const url = new URL(redisUrl);
      if (url.protocol !== "https:") throw new Error("Invalid Redis URL");
      const key = "heyu:start:" + createHash("sha256").update(ip).digest("hex");
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          "EVAL",
          RATE_SCRIPT,
          "1",
          key,
          String(WINDOW),
          String(LIMIT),
          randomUUID(),
        ]),
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (
        !response.ok ||
        data.error ||
        !Array.isArray(data.result) ||
        ![0, 1].includes(data.result[0]) ||
        !Number.isFinite(data.result[1])
      )
        throw new Error("Redis unavailable");
      result = data.result;
    } catch {
      // Fail closed instead of silently allowing unlimited paid workflow executions.
      throw new HttpError(503, "访问频率服务暂时不可用，请稍后重试。");
    }
  }
  if (!result[0])
    throw new HttpError(
      429,
      `生成次数已达上限，请 ${result[1]} 秒后再试。`,
      result[1],
    );
}
