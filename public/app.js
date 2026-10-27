import {
  MAX_WAIT,
  request,
  pollWorkflow,
  parseOutputs,
  safeMediaURL,
  textValue,
} from "./workflow.js";

const $ = (id) => document.getElementById(id);
const form = $("brief-form");
let busy = false;
let lastId = null;
let lastWant = null;

// All workflow text uses textContent, which renders HTML as literal text.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = textValue(text);
  return node;
}
function badge(text, state = "") {
  $("state-badge").textContent = text;
  $("state-badge").className = `state-badge ${state}`;
}
function notice(message = "") {
  $("notice").textContent = message;
  $("notice").hidden = !message;
}
function showBusy(value) {
  busy = value;
  $("form-fields").disabled = value;
  $("check-result").disabled = value;
  form.setAttribute("aria-busy", String(value));
}

for (const [id, max] of [
  ["audience", 60],
  ["shot", 500],
]) {
  const input = $(id);
  input.addEventListener("input", () => {
    const count = [...input.value].length;
    $(id + "-count").textContent = `${count} / ${max}`;
    $(id + "-count").classList.toggle("form-error", count > max);
    input.setCustomValidity(
      count > max
        ? `最多填写 ${max} 字。`
        : id === "audience" && !input.value.trim()
          ? "请填写目标人群。"
          : "",
    );
  });
}
$("toggle-password").addEventListener("click", () => {
  const show = $("access-code").type === "password";
  $("access-code").type = show ? "text" : "password";
  $("toggle-password").textContent = show ? "隐藏" : "显示";
  $("toggle-password").setAttribute(
    "aria-label",
    show ? "隐藏口令" : "显示口令",
  );
  $("toggle-password").setAttribute("aria-pressed", String(show));
});

function card(title, label, copyText) {
  const section = el("section", "result-card");
  const head = el("div", "result-card-header");
  const heading = el("h3");
  heading.append(
    el("span", "result-label", label),
    document.createTextNode(title),
  );
  head.append(heading);
  if (copyText) {
    const copy = el("button", "copy-button", "复制");
    copy.type = "button";
    copy.setAttribute("aria-label", `复制${title}`);
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyText);
        copy.textContent = "已复制";
      } catch {
        copy.textContent = "请手动选择复制";
      }
      setTimeout(() => {
        copy.textContent = "复制";
      }, 2000);
    });
    head.append(copy);
  }
  section.append(head);
  return section;
}

function mediaCard(type, value, description) {
  const section = card(
    type === "image" ? "配图" : "视频",
    type === "image" ? "IMAGE" : "VIDEO",
  );
  section.classList.add("media-card");
  const url = safeMediaURL(value);
  if (!url) {
    section.append(
      el(
        "p",
        "result-body",
        value
          ? "媒体地址无效，需要有效的 HTTPS 链接。"
          : "本次未返回素材，请查看工作流运行记录。",
      ),
    );
    return section;
  }
  const media = el(type === "image" ? "img" : "video");
  if (type === "image") {
    media.alt = "本次生成的商品种草配图";
    media.loading = "lazy";
    media.referrerPolicy = "no-referrer";
  } else {
    media.controls = true;
    media.playsInline = true;
    media.preload = "metadata";
  }
  media.src = url;
  media.addEventListener("error", () => {
    if (section.querySelector(".media-error")) return;
    section.append(
      el(
        "p",
        "result-body media-error",
        "素材暂时无法加载，可以尝试打开原文件。",
      ),
    );
  });
  section.append(media);
  if (description) section.append(el("p", "result-body", description));
  const link = el("a", "media-link", "打开原文件 ↗");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  section.append(link);
  return section;
}

function render(data) {
  const result = parseOutputs(data.outputs);
  $("empty-state").hidden = true;
  $("results").replaceChildren();
  if (result.verdict === "转人工") {
    badge("转人工", "warning");
    const section = card("这次内容需要人工复核", "REVIEW");
    section.classList.add("review-card");
    section.append(
      el(
        "p",
        "result-body",
        textValue(result.reason) || "工作流未提供原因，请查看 Dify 运行记录。",
      ),
    );
    $("results").append(section);
    return;
  }
  badge("自动通过", "success");
  if (result.error) notice(textValue(result.error));
  const tags = Array.isArray(result.xhs?.tags)
    ? result.xhs.tags.map(textValue).filter(Boolean)
    : textValue(result.xhs?.tags)
      ? [textValue(result.xhs.tags)]
      : [];
  const title = textValue(result.xhs?.title);
  const body = textValue(result.xhs?.body);
  const xhs = card(
    "小红书笔记",
    "01",
    [title, body, tags.join(" ")].filter(Boolean).join("\n\n"),
  );
  xhs.append(
    el("h4", "result-title", title || "未返回标题"),
    el("p", "result-body", body || "未返回正文。"),
  );
  const tagList = el("div", "tags");
  tags.forEach((tag) =>
    tagList.append(el("span", "tag", tag.startsWith("#") ? tag : `#${tag}`)),
  );
  xhs.append(tagList);
  const script = textValue(result.douyin?.script);
  const douyin = card("抖音口播", "02", script);
  douyin.append(el("p", "result-body", script || "未返回口播文案。"));
  const headline = textValue(result.detail?.headline);
  const points = Array.isArray(result.detail?.points)
    ? result.detail.points.slice(0, 3).map(textValue)
    : [];
  while (points.length < 3) points.push("未返回该卖点。");
  const price = textValue(result.detail?.price);
  const detail = card(
    "详情页首屏",
    "03",
    [headline, ...points, price].filter(Boolean).join("\n"),
  );
  detail.append(el("h4", "result-title", headline || "未返回主标题"));
  const list = el("ol", "detail-points");
  points.forEach((point) => list.append(el("li", "", point)));
  detail.append(list, el("p", "price-bar", price || "未返回价格条。"));
  $("results").append(xhs, douyin, detail);
  const media = el("div", "media-grid");
  if (lastWant?.includes("配图") || result.image_url)
    media.append(mediaCard("image", result.image_url));
  if (lastWant?.includes("视频") || result.video_url)
    media.append(
      mediaCard("video", result.video_url, textValue(result.video_desc)),
    );
  if (media.childElementCount) $("results").append(media);
  if (result.rounds !== undefined)
    $("results").append(
      el(
        "p",
        "result-meta",
        `审核轮次：${textValue(result.rounds)} · 工作流用时 ${Math.round(Number(data.elapsed) || 0)} 秒`,
      ),
    );
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  const values = new FormData(form);
  const inputs = Object.fromEntries(
    ["product", "campaign", "audience", "want", "shot"].map((key) => [
      key,
      values.get(key).trim(),
    ]),
  );
  if (!inputs.audience) {
    $("audience").setCustomValidity("请填写目标人群。");
    $("audience").reportValidity();
    return;
  }
  const code = values.get("access");
  lastId = null;
  lastWant = inputs.want;
  showBusy(true);
  notice();
  badge("正在生成", "busy");
  $("results").replaceChildren();
  $("empty-state").hidden = false;
  $("empty-state").classList.add("compact");
  $("progress").hidden = false;
  $("run-info").hidden = true;
  $("check-result").hidden = true;
  $("progress-title").textContent = "正在提交你的创作需求";
  $("progress-detail").textContent = "正在启动工作流，请稍候。";
  $("elapsed").textContent = "0";
  const started = Date.now();
  const controller = new AbortController();
  const deadline = started + MAX_WAIT;
  const cutoff = setTimeout(
    () =>
      controller.abort(
        new Error("已等待 6 分钟，已停止自动查询。任务可能仍在后台运行。"),
      ),
    MAX_WAIT,
  );
  const ticker = setInterval(() => {
    $("elapsed").textContent = String(
      Math.min(360, Math.floor((Date.now() - started) / 1000)),
    );
  }, 1000);
  try {
    // A start request is never automatically retried: it can create duplicate paid jobs.
    const { id } = await request("/api/start", code, {
      method: "POST",
      body: inputs,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]),
    });
    if (typeof id !== "string" || !id)
      throw new Error("没有收到任务编号，请先查看 Dify 运行记录。");
    lastId = id;
    $("run-info").hidden = false;
    $("run-id").textContent = `任务编号：${id}`;
    $("progress-title").textContent = "灵感正在长成素材";
    $("progress-detail").textContent =
      "每 5 秒查询一次；图片和视频可能需要更久，最长等待 6 分钟。";
    const data = await pollWorkflow({
      id,
      code,
      deadline,
      signal: controller.signal,
      onRetry: () => {
        $("progress-detail").textContent =
          "这次查询暂未成功，将继续查询，无需重复提交。";
      },
      onStatus: () => {
        $("progress-detail").textContent =
          "工作流正在运行，每 5 秒查询一次，最长等待 6 分钟。";
      },
    });
    render(data);
  } catch (error) {
    badge(lastId ? "暂未完成" : "未能提交", "warning");
    notice(
      error.name === "TimeoutError"
        ? "启动请求超时，任务可能已提交。请先查看 Dify 运行记录，避免重复生成。"
        : error.message || "网络暂时不可用，请稍后重试。",
    );
    $("check-result").hidden = !lastId;
  } finally {
    clearInterval(ticker);
    clearTimeout(cutoff);
    controller.abort();
    $("progress").hidden = true;
    $("empty-state").classList.remove("compact");
    showBusy(false);
  }
});

$("check-result").addEventListener("click", async () => {
  if (!lastId || busy) return;
  showBusy(true);
  notice();
  try {
    const data = await request(
      `/api/status?id=${encodeURIComponent(lastId)}`,
      $("access-code").value,
      { signal: AbortSignal.timeout(18000) },
    );
    if (data.status === "succeeded") {
      render(data);
      $("check-result").hidden = true;
    } else if (
      ["failed", "stopped", "partial-succeeded"].includes(data.status)
    ) {
      notice(data.error || "任务未能完成，请查看 Dify 运行记录。");
      badge("生成未完成", "warning");
    } else
      notice(
        data.status === "paused"
          ? "工作流已暂停，请在 Dify 中完成所需操作。"
          : "任务仍在后台运行，可以稍后再查。",
      );
  } catch (error) {
    notice(error.message || "暂时无法查询，请稍后重试。");
  } finally {
    showBusy(false);
  }
});
