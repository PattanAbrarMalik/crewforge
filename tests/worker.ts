// Test adapter only. Production identity comes from the trusted hosting gateway.
import { handleApi } from "../core/api.ts";
export default {
  fetch(req: Request, env: any) {
    const id = req.headers.get("x-test-user"),
      clock = req.headers.get("x-test-time");
    return handleApi(req, {
      db: env.DB,
      debug: true,
      user: id ? { id, name: id } : null,
      now: clock ? () => Number(clock) : undefined,
    });
  },
};
