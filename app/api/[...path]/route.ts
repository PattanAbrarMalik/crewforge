import { env } from "cloudflare:workers";
import { handleApi } from "../../../core/api";
async function route(req: Request) {
  const id =
    req.headers.get("oai-authenticated-user-id") ||
    (import.meta.env.DEV ? "local-preview" : null);
  let name = req.headers.get("oai-authenticated-user-full-name") ?? "Builder";
  if (
    req.headers.get("oai-authenticated-user-full-name-encoding") ===
    "percent-encoded-utf-8"
  ) {
    try {
      name = decodeURIComponent(name);
    } catch {}
  }
  return handleApi(req, { db: env.DB!, user: id ? { id, name } : null });
}
export { route as GET, route as POST, route as PATCH, route as DELETE };
