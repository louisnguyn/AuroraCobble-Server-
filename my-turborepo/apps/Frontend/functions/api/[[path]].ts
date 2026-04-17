/**
 * Cloudflare Pages: proxy everything under `/api/*` to your Node backend.
 * Without this, POST /api/usage-stats hits static Pages and Cloudflare returns HTML 400.
 *
 * Set environment variable BACKEND_URL in Pages → Settings → Environment variables
 * (Production + Preview). Example: https://your-service.up.railway.app  (no trailing slash)
 */

type Env = {
  BACKEND_URL?: string;
};

function stripHopByHopHeaders(h: Headers): Headers {
  const out = new Headers();
  h.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "keep-alive" ||
      lower === "transfer-encoding" ||
      lower === "content-length" ||
      lower.startsWith("cf-") ||
      lower === "cdn-loop"
    ) {
      return;
    }
    out.set(key, value);
  });
  return out;
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const backendBase = (context.env.BACKEND_URL ?? "").trim().replace(/\/$/, "");
  if (!backendBase) {
    return Response.json(
      {
        error:
          "Cloudflare Pages: set BACKEND_URL to your Node API origin (e.g. https://….railway.app). " +
          "Dashboard → Pages project → Settings → Environment variables.",
      },
      { status: 503 }
    );
  }

  const incoming = context.request;
  const url = new URL(incoming.url);
  const targetUrl = `${backendBase}${url.pathname}${url.search}`;

  const headers = stripHopByHopHeaders(incoming.headers);

  const init: RequestInit = {
    method: incoming.method,
    headers,
    redirect: "manual",
  };
  if (incoming.method !== "GET" && incoming.method !== "HEAD") {
    init.body = incoming.body;
  }

  try {
    return await fetch(new Request(targetUrl, init));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "API proxy failed", detail }, { status: 502 });
  }
}
