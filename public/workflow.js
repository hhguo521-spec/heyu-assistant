import { API_BASE } from "./runtime-config.js";

export const POLL_INTERVAL = 5000;
export const MAX_WAIT = 360000;

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export async function request(
  path,
  code,
  { method = "GET", body, signal } = {},
) {
  if (!API_BASE && globalThis.location?.hostname.endsWith(".github.io"))
    throw new ApiError("生成服务正在接入，请稍后再试。", 503);
  const response = await fetch(API_BASE ? new URL(path, API_BASE).href : path, {
    method,
    cache: "no-store",
    signal,
    headers: {
      "X-Access-Code": code,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError("服务暂时没有返回有效数据。", response.status || 502);
  }
  if (!response.ok)
    throw new ApiError(
      typeof data.error === "string" ? data.error : "请求失败，请稍后重试。",
      response.status,
    );
  return data;
}

export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function pollWorkflow({
  id,
  code,
  deadline,
  signal,
  onRetry = () => {},
  onStatus = () => {},
  now = Date.now,
  sleep = delay,
  getStatus = request,
}) {
  let nextPoll = now() + POLL_INTERVAL;
  while (now() < deadline) {
    await sleep(
      Math.min(Math.max(0, nextPoll - now()), deadline - now()),
      signal,
    );
    if (signal?.aborted) throw signal.reason;
    if (now() >= deadline) break;
    const started = now();
    nextPoll = started + POLL_INTERVAL;
    try {
      const data = await getStatus(
        `/api/status?id=${encodeURIComponent(id)}`,
        code,
        {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(18000)])
            : AbortSignal.timeout(18000),
        },
      );
      if (now() >= deadline || signal?.aborted) break;
      if (data.status === "succeeded") return data;
      if (["failed", "stopped", "partial-succeeded"].includes(data.status))
        throw new ApiError(data.error || "这次生成未能完成，请稍后重试。", 422);
      if (data.status === "paused")
        throw new ApiError(
          "工作流已暂停，请在 Dify 中完成所需操作后再查询结果。",
          422,
        );
      if (!["running", "pending", "queued"].includes(data.status))
        throw new ApiError("工作流返回了无法识别的状态。", 422);
      onStatus(data);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if ([400, 401, 403, 405, 422].includes(error.status)) throw error;
      onRetry(error);
    }
  }
  throw new ApiError(
    "已等待 6 分钟，已停止自动查询。任务可能仍在后台运行，你可以稍后再查一次结果。",
    408,
  );
}

export const textValue = (value) =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : "";
export function safeMediaURL(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseOutputs(outputs) {
  if (!outputs || typeof outputs !== "object")
    throw new Error("工作流没有返回结果，请检查 Dify 的结束节点。");
  let result;
  try {
    result =
      typeof outputs.result === "string"
        ? JSON.parse(outputs.result)
        : outputs.result;
  } catch {
    if (outputs.verdict === "转人工")
      return {
        verdict: "转人工",
        reason:
          "工作流要求人工复核，但未返回可读取的原因，请查看 Dify 运行记录。",
      };
    throw new Error("工作流 result 不是有效的 JSON，请检查 Dify 输出。");
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("工作流返回的结果格式不正确。");
  // Either explicit review verdict wins over an inconsistent automatic approval.
  const verdict =
    result.verdict === "转人工" || outputs.verdict === "转人工"
      ? "转人工"
      : textValue(outputs.verdict) || textValue(result.verdict);
  if (!["自动通过", "转人工"].includes(verdict))
    throw new Error("工作流未返回有效的审核结论，请查看 Dify 运行记录。");
  return {
    ...result,
    verdict,
    image_url: textValue(outputs.image_url) || textValue(result.image_url),
    video_url: textValue(outputs.video_url) || textValue(result.video_url),
  };
}
