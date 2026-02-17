import express from "express";

const app = express();
const port = process.env.PORT ?? 3001;

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Backend running" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Backend http://localhost:${port}`);
});
