import "dotenv/config";
import express from "express";

const app = express();
const port = process.env.PORT ?? 3001;

const cobbleStore = {
  usageStats: null as unknown,
  leaderboard: null as unknown,
};
const COBBLE_API_KEY = process.env.COBBLE_API_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

// CORS: required when frontend is on a different origin (e.g. deploy frontend + backend separately)
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (process.env.NODE_ENV === "production" && CORS_ORIGIN === "*") {
    // In production, prefer setting CORS_ORIGIN to your frontend URL for security
  }
  next();
});
app.options("*", (_, res) => res.sendStatus(204));

function requireCobbleAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!COBBLE_API_KEY) return next();
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token !== COBBLE_API_KEY) {
    res.status(401).json({ error: { code: "401", message: "token expired or incorrect" } });
    return;
  }
  next();
}
// Normalize double slashes (plugin may send baseUrl/ + /path => //path)
// app.use((req, _res, next) => {
//   if (req.url?.includes("//")) {
//     const [path, qs] = req.url.split("?");
//     req.url = (path?.replace(/\/+/g, "/") || "/") + (qs ? `?${qs}` : "");
//   }
//   next();
// });
app.use(express.json());
app.use((req, _res, next) => {
  console.log(req.method, req.path);
  next();
});

app.get("/", (_req, res) => {
  res.json({ message: "Backend running" });
});
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/usage-stats", (_req, res) => res.json(cobbleStore.usageStats ?? {}));
app.post("/usage-stats", requireCobbleAuth, (req, res) => {
  cobbleStore.usageStats = req.body;
  console.log("[CobbleRanked] usage-stats pushed");
  res.json({ ok: true });
});
app.get("/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
app.post("/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  console.log("[CobbleRanked] leaderboard pushed");
  res.json({ ok: true });
});

app.get("/v4/usage-stats", (_req, res) => res.json(cobbleStore.usageStats ?? {}));
app.post("/v4/usage-stats", requireCobbleAuth, (req, res) => {
  cobbleStore.usageStats = req.body;
  console.log("[CobbleRanked] usage-stats pushed");
  res.json({ ok: true });
});
app.get("/v4/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
app.post("/v4/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  console.log("[CobbleRanked] leaderboard pushed");
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Backend http://localhost:${port}`);
});
