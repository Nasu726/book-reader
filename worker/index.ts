/**
 * The Worker: the app's files, and later the vault's proxy.
 *
 * Everything that is a file is served by the assets binding, and any path that
 * is not one is the app itself (single-page fallback), which reads the screen
 * from the URL. The Worker holds no data of the reader's; what it will hold
 * is the token the vault proxy writes with (PIVOT-005).
 */

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
