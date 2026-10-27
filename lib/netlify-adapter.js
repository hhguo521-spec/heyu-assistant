import { Readable } from "node:stream";

// Netlify supplies context.ip; never trust a client-supplied forwarded-for header.
export function createWebHandler(nodeHandler, { env = process.env } = {}) {
  return async (request, context) => {
    const origin = request.headers.get("origin");
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",").map((value) => value.trim()).filter(Boolean);
    const ownOrigin = new URL(request.url).origin;
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin",
    });
    if (origin && origin !== ownOrigin && !allowed.includes(origin))
      return new Response(JSON.stringify({ error: "此网页尚未获准连接生成服务。" }), { status: 403, headers });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") {
      const method = request.headers.get("access-control-request-method");
      const requested = (request.headers.get("access-control-request-headers") || "")
        .toLowerCase().split(",").map((value) => value.trim()).filter(Boolean);
      if (!["GET", "POST"].includes(method) || requested.some((h) => !["content-type", "x-access-code"].includes(h)))
        return new Response(JSON.stringify({ error: "不支持的跨域请求。" }), { status: 403, headers });
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type, X-Access-Code");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    const req = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
    req.url = request.url;
    req.method = request.method;
    req.headers = Object.fromEntries(request.headers);
    req.socket = { remoteAddress: context.ip };
    let body = "";
    const res = {
      statusCode: 200,
      setHeader: (name, value) => headers.set(name, String(value)),
      end: (value) => { body = value; },
    };
    await nodeHandler(req, res);
    return new Response(body, { status: res.statusCode, headers });
  };
}
