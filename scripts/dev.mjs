import http from "node:http";
import { readFile } from "node:fs/promises";
import start from "../api/start.js";
import status from "../api/status.js";

const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const types = {
  "/": "text/html",
  "/index.html": "text/html",
  "/styles.css": "text/css",
  "/liquid.css": "text/css",
  "/creation.css": "text/css",
  "/liquid.js": "text/javascript",
  "/app.js": "text/javascript",
  "/workflow.js": "text/javascript",
  "/runtime-config.js": "text/javascript",
  "/favicon.svg": "image/svg+xml",
};
const server = http.createServer(async (req, res) => {
  for (const { key, value } of config.headers[0].headers) res.setHeader(key, value);
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/api/start") return start(req, res);
  if (pathname === "/api/status") return status(req, res);
  if (!types[pathname]) {
    res.writeHead(404);
    return res.end("Not found");
  }
  try {
    const file = new URL(
      "../public" + (pathname === "/" ? "/index.html" : pathname),
      import.meta.url,
    );
    res.setHeader("Content-Type", types[pathname] + "; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(Number(process.env.PORT || 3000), "127.0.0.1", () =>
  console.log(`禾予 · 种草助手：http://127.0.0.1:${server.address().port}`),
);
