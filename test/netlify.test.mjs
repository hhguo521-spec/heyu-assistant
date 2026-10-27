import test from "node:test";
import assert from "node:assert/strict";
import { createWebHandler } from "../lib/netlify-adapter.js";
import { createHandler as startHandler } from "../api/start.js";
import { createHandler as statusHandler } from "../api/status.js";
const origin = "https://hhguo521-spec.github.io";
const env = { ACCESS_CODE: "test-code", DIFY_API_KEY: "test-only", ALLOWED_ORIGINS: origin, NODE_ENV: "production" };
const inputs = { product: "T20 Pro 月白", campaign: "双 11", audience: "养猫的上班族", want: "只要文案", shot: "" };
const makeRequest = (path = "/api/start", options = {}) => new Request(`https://heyu-test.netlify.app${path}`, { method: "POST", headers: { origin, "x-access-code": "test-code", "content-type": "application/json", "x-forwarded-for": "9.9.9.9", "x-vercel-forwarded-for": "9.9.9.9" }, body: JSON.stringify(inputs), ...options });
test("Netlify adapter uses platform IP and preserves validated inputs", async () => {
  let actualIP;
  const handler = createWebHandler(startHandler({ env, rateLimit: async (ip) => { actualIP = ip; }, startWorkflow: async (data, ip) => { assert.equal(ip, "1.2.3.4"); assert.deepEqual(data, inputs); return "run-123"; } }), { env });
  const response = await handler(makeRequest(), { ip: "1.2.3.4" });
  assert.equal(response.status, 200);
  assert.equal(actualIP, "1.2.3.4");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.deepEqual(await response.json(), { id: "run-123" });
});
test("Netlify auth errors remain readable by approved Pages origin", async () => {
  const handler = createWebHandler(startHandler({ env }), { env });
  const response = await handler(makeRequest("/api/start", { headers: { origin, "content-type": "application/json" } }), { ip: "1.2.3.4" });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
});
test("CORS permits approved preflight without starting a workflow and rejects other origins", async () => {
  let called = false;
  const handler = createWebHandler(async () => { called = true; }, { env });
  const response = await handler(makeRequest("/api/start", { method: "OPTIONS", body: undefined, headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-access-code" } }), {});
  assert.equal(response.status, 204); assert.equal(called, false);
  const blocked = await handler(makeRequest("/api/start", { headers: { origin: "https://attacker.example" } }), {});
  assert.equal(blocked.status, 403); assert.equal(called, false);
  assert.equal(blocked.headers.get("Access-Control-Allow-Origin"), null);
});
test("Netlify adapter preserves polling query and upstream status", async () => {
  const handler = createWebHandler(statusHandler({ env, workflowStatus: async (id) => { assert.equal(id, "run-123"); return { status: "succeeded", elapsed: 9, error: null, outputs: { verdict: "自动通过" } }; } }), { env });
  const response = await handler(makeRequest("/api/status?id=run-123", { method: "GET", body: undefined }), { ip: "1.2.3.4" });
  assert.equal((await response.json()).status, "succeeded");
});
test("Netlify adapter does not bypass body limit or per-IP limit", async () => {
  const { HttpError } = await import("../lib/common.js");
  const handler = createWebHandler(startHandler({ env, rateLimit: async () => { throw new HttpError(429, "limited", 30); } }), { env });
  const large = await handler(makeRequest("/api/start", { body: "x".repeat(8193) }), { ip: "1.2.3.4" });
  assert.equal(large.status, 413);
  const limited = await handler(makeRequest(), { ip: "1.2.3.4" });
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("Retry-After"), "30");
});
