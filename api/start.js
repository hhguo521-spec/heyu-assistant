import {
  guard,
  send,
  fail,
  readBody,
  validateInputs,
  clientIP,
} from "../lib/common.js";
import { rateLimit } from "../lib/rate-limit.js";
import { startWorkflow } from "../lib/dify.js";

export function createHandler(deps = {}) {
  return async function handler(req, res) {
    try {
      guard(req, res, "POST", deps.env);
      const inputs = validateInputs(await readBody(req));
      const ip = clientIP(req, deps.env);
      await (deps.rateLimit || rateLimit)(ip, deps);
      const id = await (deps.startWorkflow || startWorkflow)(inputs, ip, deps);
      send(res, 200, { id });
    } catch (error) {
      fail(res, error);
    }
  };
}
export default createHandler();
