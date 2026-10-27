import { guard, send, fail, validId, HttpError } from "../lib/common.js";
import { workflowStatus } from "../lib/dify.js";

export function createHandler(deps = {}) {
  return async function handler(req, res) {
    try {
      guard(req, res, "GET", deps.env);
      const params = new URL(req.url, "http://localhost").searchParams;
      const id = params.get("id");
      if (params.getAll("id").length !== 1 || !validId(id))
        throw new HttpError(400, "任务编号无效。");
      send(res, 200, await (deps.workflowStatus || workflowStatus)(id, deps));
    } catch (error) {
      fail(res, error);
    }
  };
}
export default createHandler();
