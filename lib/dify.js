import { apiBase, HttpError, validId } from "./common.js";

export async function firstRunId(stream) {
  if (!stream) throw new HttpError(502, "生成服务没有返回数据流。");
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (frame) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return null;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new HttpError(502, "生成服务返回了无效事件。");
    }
    if (event.event === "error")
      throw new HttpError(502, "工作流启动失败，请检查 Dify 配置后重试。");
    if (event.workflow_run_id !== undefined) {
      if (!validId(event.workflow_run_id))
        throw new HttpError(502, "生成服务返回了无效任务编号。");
      return event.workflow_run_id;
    }
    return null;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const id = parse(frame);
        if (id) return id;
      }
      if (buffer.length > 1_048_576)
        throw new HttpError(502, "生成服务返回的数据过大。");
      if (done) {
        const id = parse(buffer);
        if (id) return id;
        throw new HttpError(502, "未收到任务编号，请稍后检查 Dify 运行记录。");
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function startWorkflow(
  inputs,
  ip,
  { env = process.env, fetchImpl = fetch } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetchImpl(`${apiBase(env)}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.DIFY_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        inputs,
        response_mode: "streaming",
        user: `web-${ip}`,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(
        502,
        "Dify 未能启动工作流，请检查 API Key、输入变量和发布状态。",
      );
    }
    return await firstRunId(response.body);
  } catch (error) {
    if (controller.signal.aborted)
      throw new HttpError(
        504,
        "启动超时，任务可能已经提交，请先检查 Dify 运行记录，避免重复生成。",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export async function workflowStatus(
  id,
  { env = process.env, fetchImpl = fetch } = {},
) {
  const response = await fetchImpl(
    `${apiBase(env)}/workflows/run/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `Bearer ${env.DIFY_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(
      response.status === 404 ? 404 : 502,
      response.status === 404
        ? "暂未查到任务，请稍后重试。"
        : "暂时无法查询生成进度。",
    );
  }
  const data = await response.json();
  if (typeof data.status !== "string")
    throw new HttpError(502, "生成服务返回了无效状态。");
  const elapsed = Number.isFinite(data.elapsed_time)
    ? data.elapsed_time
    : Number.isFinite(data.created_at)
      ? Math.max(0, Math.floor(Date.now() / 1000) - data.created_at)
      : 0;
  const error =
    typeof data.error === "string"
      ? data.error.split(env.DIFY_API_KEY).join("[已隐藏]")
      : null;
  return { status: data.status, elapsed, error, outputs: data.outputs ?? null };
}
