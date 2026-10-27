import { createHandler } from "../../api/start.js";
import { createWebHandler } from "../../lib/netlify-adapter.js";
const env = { ...process.env, VERCEL: undefined, NODE_ENV: "production" };
export default createWebHandler(createHandler({ env }), { env });
export const config = { path: "/api/start" };
