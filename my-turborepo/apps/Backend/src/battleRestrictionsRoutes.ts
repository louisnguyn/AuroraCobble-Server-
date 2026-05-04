import type express from "express";
import multer from "multer";
import { supabase } from "./supabase.js";
import { fetchBattleRestrictionsPublic, upsertBattleRestrictionsFromAdmin } from "./battleRestrictionsDb.js";
import { uploadRestrictionImageToStorage } from "./restrictionImageUpload.js";

const UPLOAD = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.mimetype));
  },
});

type Deps = {
  requireAuth: express.RequestHandler;
  requireAdmin: express.RequestHandler;
};

export function registerBattleRestrictionsRoutes(app: express.Express, deps: Deps): void {
  const { requireAuth, requireAdmin } = deps;

  app.get("/battle-restrictions", async (_req, res) => {
    const out = await fetchBattleRestrictionsPublic();
    if (!out.ok) {
      const missing = /Run supabase/i.test(out.error);
      res.status(missing ? 503 : 500).json({ error: out.error });
      return;
    }
    res.json(out.data);
  });

  app.get("/admin/battle-restrictions", requireAuth, requireAdmin, async (_req, res) => {
    const out = await fetchBattleRestrictionsPublic();
    if (!out.ok) {
      const missing = /Run supabase/i.test(out.error);
      res.status(missing ? 503 : 500).json({ error: out.error });
      return;
    }
    res.json(out.data);
  });

  app.put("/admin/battle-restrictions", requireAuth, requireAdmin, async (req, res) => {
    const body = req.body ?? {};
    const out = await upsertBattleRestrictionsFromAdmin(typeof body === "object" && body ? body : {});
    if (!out.ok) {
      const missing = /Run supabase/i.test(out.error);
      res.status(missing ? 503 : 500).json({ error: out.error });
      return;
    }
    res.json(out.data);
  });

  app.post(
    "/admin/battle-restrictions/upload-image",
    requireAuth,
    requireAdmin,
    (req, res, next) => {
      UPLOAD.single("image")(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            res.status(400).json({ error: "Image must be 2 MB or smaller." });
            return;
          }
          res.status(400).json({ error: err.message });
          return;
        }
        if (err) {
          res.status(400).json({ error: String((err as Error).message ?? err) });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      if (!supabase) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }
      const buf = req.file?.buffer;
      if (!Buffer.isBuffer(buf)) {
        res.status(400).json({ error: "Choose an image file (PNG, JPEG, WebP, or GIF)." });
        return;
      }
      const up = await uploadRestrictionImageToStorage(supabase, buf);
      if ("error" in up) {
        res.status(400).json({ error: up.error });
        return;
      }
      res.json({ url: up.publicUrl });
    }
  );
}
