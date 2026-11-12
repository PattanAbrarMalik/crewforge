import { createServer } from "node:http";
import { harness } from "./harness.ts";
const h = await harness({
  persist: process.env.CHAOS_DB,
  migrate: process.env.CHAOS_MIGRATE === "1",
});
const server = createServer(async (req, res) => {
  try {
    const buffers = [];
    for await (const b of req) buffers.push(b);
    const body = Buffer.concat(buffers);
    const response = await h.mf.dispatchFetch("http://localhost" + req.url, {
      method: req.method,
      headers: req.headers,
      body: body.length ? body : undefined,
    });
    if (
      req.url === "/api/join" &&
      req.headers["x-kill-after-commit"] === "1" &&
      response.status === 200
    ) {
      process.send?.({ type: "committed" });
      return;
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
server.listen(0, "127.0.0.1", () =>
  process.send?.({ type: "ready", port: server.address().port }),
);
process.on("SIGTERM", async () => {
  server.close();
  await h.mf.dispose();
  process.exit(0);
});
