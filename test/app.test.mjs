import test from "node:test";
import assert from "node:assert/strict";
import { createHandler as startHandler } from "../api/start.js";
import { createHandler as statusHandler } from "../api/status.js";
import { validateInputs, clientIP, apiBase, HttpError } from "../lib/common.js";
import { firstRunId, startWorkflow, workflowStatus } from "../lib/dify.js";
import { localLimit, rateLimit } from "../lib/rate-limit.js";
import {
  pollWorkflow,
  parseOutputs,
  safeMediaURL,
  ApiError,
} from "../public/workflow.js";
import { readFile, readdir } from "node:fs/promises";

const env = {
  ACCESS_CODE: "test-access",
  DIFY_API_KEY: "server-only-test-key",
};
const inputs = {
  product: "T20 Pro 月白",
  campaign: "双 11",
  audience: "养猫的上班族",
  want: "文案 + 配图 + 视频",
  shot: "",
};
const req = (extra = {}) => ({
  method: "POST",
  url: "/api/start",
  headers: {
    "content-type": "application/json",
    "x-access-code": env.ACCESS_CODE,
  },
  socket: { remoteAddress: "127.0.0.1" },
  body: inputs,
  ...extra,
});
const res = () => ({
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  end(body) {
    this.data = JSON.parse(body);
  },
});

test("all product/want choices work; invalid and oversized fields are rejected", () => {
  for (const product of [
    "T20 Pro 月白",
    "T20 Pro 曜石黑",
    "T10 月白",
    "S1 Max 标准版",
    "S1 Max 上下水版",
  ]) {
    for (const want of ["文案 + 配图 + 视频", "文案 + 配图", "只要文案"])
      assert.equal(
        validateInputs({ ...inputs, product, want }).product,
        product,
      );
  }
  for (const patch of [
    { product: "fake" },
    { want: "fake" },
    { audience: "  " },
    { audience: "字".repeat(61) },
    { audience: [] },
    { shot: "字".repeat(501) },
    { campaign: {} },
    { campaign: "字".repeat(21) },
  ]) {
    assert.throws(() => validateInputs({ ...inputs, ...patch }), {
      status: 400,
    });
  }
  assert.equal(validateInputs({ ...inputs, campaign: "" }).campaign, "双 11");
  assert.equal(validateInputs({ ...inputs, campaign: "字".repeat(20) }).campaign.length, 20);
  assert.equal(
    validateInputs({ ...inputs, audience: "🌱".repeat(60) }).audience.length,
    120,
  );
});

test("both endpoints require access code before doing any upstream work", async () => {
  for (const factory of [startHandler, statusHandler]) {
    for (const code of [undefined, "", "wrong"]) {
      const response = res();
      await factory({ env })(
        req({ headers: { "x-access-code": code } }),
        response,
      );
      assert.equal(response.statusCode, 401);
      assert.equal(response.headers["Cache-Control"], "no-store");
    }
  }
});

test("start validates JSON, method and length before launching; hides unexpected errors", async () => {
  const handler = startHandler({
    env,
    rateLimit: async () => {},
    startWorkflow: async () => {
      throw new Error(env.DIFY_API_KEY);
    },
  });
  for (const [patch, code] of [
    [{ method: "GET" }, 405],
    [{ body: "{bad" }, 400],
    [{ body: "x".repeat(9000) }, 413],
    [{ headers: { "x-access-code": env.ACCESS_CODE } }, 415],
    [{ body: { ...inputs, product: "bad" } }, 400],
    [{}, 502],
  ]) {
    const response = res();
    await handler(req(patch), response);
    assert.equal(response.statusCode, code);
    assert.equal(
      JSON.stringify(response.data).includes(env.DIFY_API_KEY),
      false,
    );
  }
});

test("start returns the run ID and correct validated inputs and client IP", async () => {
  const response = res();
  await startHandler({
    env,
    rateLimit: async (ip) => assert.equal(ip, "127.0.0.1"),
    startWorkflow: async (data, ip) => {
      assert.deepEqual(data, inputs);
      assert.equal(ip, "127.0.0.1");
      return "run-123";
    },
  })(req(), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.data, { id: "run-123" });
});

test("status rejects path injection and duplicate IDs, and only returns normalized fields", async () => {
  const handler = statusHandler({
    env,
    workflowStatus: async (id) => ({
      status: "running",
      elapsed: 12,
      error: null,
      outputs: { id },
    }),
  });
  for (const url of [
    "/api/status",
    "/api/status?id=../secret",
    "/api/status?id=a&id=b",
  ]) {
    const response = res();
    await handler(req({ method: "GET", url }), response);
    assert.equal(response.statusCode, 400);
  }
  const response = res();
  await handler(
    req({ method: "GET", url: "/api/status?id=run-123" }),
    response,
  );
  assert.deepEqual(response.data, {
    status: "running",
    elapsed: 12,
    error: null,
    outputs: { id: "run-123" },
  });
});

test("uses only trusted Vercel IP headers; local forwarded headers cannot spoof identity", () => {
  assert.equal(
    clientIP(req({ headers: { "x-forwarded-for": "1.2.3.4" } }), {}),
    "127.0.0.1",
  );
  assert.equal(
    clientIP(
      req({
        headers: {
          "x-vercel-forwarded-for": "1.2.3.4",
          "x-forwarded-for": "8.8.8.8",
        },
      }),
      { VERCEL: "1" },
    ),
    "1.2.3.4",
  );
  assert.throws(() => clientIP(req(), { VERCEL: "1" }), { status: 503 });
  assert.equal(apiBase(env), "https://api.dify.ai/v1");
  assert.equal(
    apiBase({ DIFY_API_BASE_URL: "http://localhost/v1" }),
    "http://localhost/v1",
  );
  assert.throws(
    () => apiBase({ VERCEL: "1", DIFY_API_BASE_URL: "http://localhost/v1" }),
    { status: 503 },
  );
});

test("rolling limit is six per IP and expires exactly at ten minutes", () => {
  const map = new Map();
  for (let i = 0; i < 6; i++)
    assert.equal(localLimit("a", i * 1000, map)[0], 1);
  assert.deepEqual(localLimit("a", 5000, map), [0, 595]);
  assert.equal(localLimit("b", 5000, map)[0], 1);
  assert.equal(localLimit("a", 599999, map)[0], 0);
  assert.equal(localLimit("a", 600000, map)[0], 1);
  assert.equal(localLimit("a", 600000, map)[0], 0);
});

test("production rate limiting fails closed and never uses the local-memory switch", async () => {
  await assert.rejects(
    rateLimit("a", { env: { VERCEL: "1", LOCAL_MEMORY_RATE_LIMIT: "true" } }),
    { status: 503 },
  );
  const redisEnv = {
    ...env,
    UPSTASH_REDIS_REST_URL: "https://example.test",
    UPSTASH_REDIS_REST_TOKEN: "redis-token",
  };
  await assert.rejects(
    rateLimit("a", {
      env: redisEnv,
      fetchImpl: async () => {
        throw new Error("offline");
      },
    }),
    { status: 503 },
  );
  await assert.rejects(
    rateLimit("a", {
      env: redisEnv,
      fetchImpl: async (_url, options) => {
        const command = JSON.parse(options.body);
        assert.equal(command[0], "EVAL");
        assert.equal(command[2], "1");
        assert.equal(command[4], "600000");
        return Response.json({ result: [0, 42] });
      },
    }),
    { status: 429, retryAfter: 42 },
  );
});

test("Vercel Marketplace Redis variables work without mixing credential pairs", async () => {
  const marketplaceEnv = {
    VERCEL: "1",
    KV_REST_API_URL: "https://marketplace.example.test",
    KV_REST_API_TOKEN: "marketplace-token",
  };
  await rateLimit("a", {
    env: marketplaceEnv,
    fetchImpl: async (url, options) => {
      assert.equal(url.hostname, "marketplace.example.test");
      assert.equal(options.headers.Authorization, "Bearer marketplace-token");
      return Response.json({ result: [1, 0] });
    },
  });
  await assert.rejects(rateLimit("a", {
    env: { ...marketplaceEnv, UPSTASH_REDIS_REST_URL: "https://other.example.test" },
    fetchImpl: async () => { assert.fail("Incomplete credentials must not call Redis"); },
  }), { status: 503 });
});

test("429 propagates Retry-After without starting a workflow", async () => {
  const response = res();
  await startHandler({
    env,
    rateLimit: async () => {
      throw new HttpError(429, "Too many", 31);
    },
    startWorkflow: () => assert.fail("Must not run"),
  })(req(), response);
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["Retry-After"], "31");
});

test("SSE tolerates every byte boundary, CRLF, ping and unicode; closes on first ID", async () => {
  const bytes = new TextEncoder().encode(
    'event: ping\r\n\r\n: heartbeat\r\n\r\ndata: {"event":"workflow_started","workflow_run_id":"run-abc","data":{"label":"月白"}}\r\n\r\ndata: {"workflow_run_id":"wrong"}\n\n',
  );
  let cancelled = false;
  let index = 0;
  const stream = new ReadableStream({
    pull(c) {
      c.enqueue(bytes.slice(index, ++index));
    },
    cancel() {
      cancelled = true;
    },
  });
  assert.equal(await firstRunId(stream), "run-abc");
  assert.ok(cancelled);
  assert.ok(index < bytes.length);
});

test("SSE handles multiline data and rejects errors, broken JSON and missing ID", async () => {
  assert.equal(
    await firstRunId(
      new Response('data: {"workflow_run_id":\ndata: "run-xyz"}\n\n').body,
    ),
    "run-xyz",
  );
  for (const data of [
    'data: {"event":"error","message":"private detail"}\n\n',
    "data: bad\n\n",
    ": ping\n\n",
  ])
    await assert.rejects(firstRunId(new Response(data).body), { status: 502 });
});

test("Dify start sends exact request contract and aborts upstream after receiving ID", async () => {
  let signal;
  const id = await startWorkflow(inputs, "1.2.3.4", {
    env,
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.dify.ai/v1/workflows/run");
      assert.equal(options.headers.Authorization, `Bearer ${env.DIFY_API_KEY}`);
      assert.deepEqual(JSON.parse(options.body), {
        inputs,
        response_mode: "streaming",
        user: "web-1.2.3.4",
      });
      signal = options.signal;
      return new Response('data: {"workflow_run_id":"run-123"}\n\n');
    },
  });
  assert.equal(id, "run-123");
  assert.ok(signal.aborted);
});

test("status maps elapsed_time and does not leak API key in upstream errors", async () => {
  const result = await workflowStatus("run-123", {
    env,
    fetchImpl: async (url) => {
      assert.ok(url.endsWith("/workflows/run/run-123"));
      return Response.json({
        status: "failed",
        elapsed_time: 7.8,
        error: env.DIFY_API_KEY,
        outputs: null,
        secret_field: "hidden",
      });
    },
  });
  assert.deepEqual(result, {
    status: "failed",
    elapsed: 7.8,
    error: "[已隐藏]",
    outputs: null,
  });
});

test("polls every five seconds, retries transient failures, and stops on success", async () => {
  let now = 0;
  const times = [];
  let retries = 0;
  const result = await pollWorkflow({
    id: "r",
    code: "c",
    deadline: 360000,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    onRetry: () => retries++,
    getStatus: async () => {
      times.push(now);
      if (times.length === 1) throw new ApiError("Temporary", 502);
      return { status: times.length === 3 ? "succeeded" : "running" };
    },
  });
  assert.deepEqual(times, [5000, 10000, 15000]);
  assert.equal(retries, 1);
  assert.equal(result.status, "succeeded");
});

test("polling stops at six minutes without a late status fetch", async () => {
  let now = 0;
  let calls = 0;
  await assert.rejects(
    pollWorkflow({
      id: "r",
      code: "c",
      deadline: 360000,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      getStatus: async () => {
        calls++;
        return { status: "running" };
      },
    }),
    { status: 408 },
  );
  assert.equal(now, 360000);
  assert.equal(calls, 71);
});

test("authentication failures, terminal failures and pauses stop polling", async () => {
  for (const status of [
    "failed",
    "stopped",
    "partial-succeeded",
    "paused",
    "unknown",
    "401",
  ]) {
    let now = 0;
    let calls = 0;
    await assert.rejects(
      pollWorkflow({
        id: "r",
        code: "c",
        deadline: 360000,
        now: () => now,
        sleep: async (ms) => {
          now += ms;
        },
        getStatus: async () => {
          calls++;
          if (status === "401") throw new ApiError("Bad code", 401);
          return { status, error: "failed" };
        },
      }),
      { status: status === "401" ? 401 : 422 },
    );
    assert.equal(calls, 1);
  }
});

test("parses nested JSON, uses top-level URLs, and review verdict wins", () => {
  const output = {
    verdict: "自动通过",
    result: JSON.stringify({
      verdict: "自动通过",
      image_url: "https://old.test/x.png",
      xhs: { title: "<script>alert(1)</script>" },
    }),
    image_url: "https://new.test/x.png",
  };
  assert.equal(parseOutputs(output).image_url, output.image_url);
  assert.equal(
    parseOutputs({ ...output, verdict: "转人工" }).verdict,
    "转人工",
  );
  assert.equal(
    parseOutputs({
      ...output,
      result: JSON.stringify({ verdict: "转人工", reason: "<b>审核</b>" }),
    }).reason,
    "<b>审核</b>",
  );
  assert.throws(() => parseOutputs({ result: "{" }));
  assert.throws(() => parseOutputs({ result: "{}" }));
});

test("rejects executable, insecure and credential-bearing media URLs", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,bad",
    "//example.com/a",
    "http://example.com/a",
    "https://name:password@example.com/a",
    "<img>",
  ])
    assert.equal(safeMediaURL(value), null);
  assert.equal(
    safeMediaURL("https://example.com/a.mp4?sig=123"),
    "https://example.com/a.mp4?sig=123",
  );
});

test("frontend never uses HTML injection sinks or contains backend secrets", async () => {
  for (const filename of await readdir(
    new URL("../public/", import.meta.url),
  )) {
    const content = await readFile(
      new URL("../public/" + filename, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      content,
      /innerHTML|outerHTML|insertAdjacentHTML|DIFY_API_KEY|UPSTASH_REDIS_REST_TOKEN|server-only-test-key/,
    );
  }
});
