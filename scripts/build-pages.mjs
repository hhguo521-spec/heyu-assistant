import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
const target = new URL("../pages-dist/", import.meta.url);
const base = process.env.PUBLIC_API_BASE_URL || "";
let apiOrigin = "";
if (base) {
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("PUBLIC_API_BASE_URL must be an HTTPS origin without credentials or paths");
  apiOrigin = url.origin;
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
// Explicit public-only copy. No API source, configuration secrets, or DSL exports.
await cp(new URL("../public/", import.meta.url), target, { recursive: true });
await writeFile(new URL("runtime-config.js", target), `export const API_BASE = ${JSON.stringify(apiOrigin)};\n`);
await writeFile(new URL(".nojekyll", target), "");
const indexPath = new URL("index.html", target);
const index = await readFile(indexPath, "utf8");
const csp = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; media-src 'self' https:; connect-src 'self' ${apiOrigin}; object-src 'none'; base-uri 'self'; form-action 'self'`;
await writeFile(indexPath, index.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`));
console.log(apiOrigin ? "GitHub Pages built with configured backend." : "GitHub Pages built; backend configuration is pending.");
