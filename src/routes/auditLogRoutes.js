import express from "express";

import {
  getAuditLogs,
} from "../controllers/auditLogController.js";

import {
  authenticateUser,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/",
  authenticateUser,
  getAuditLogs
);

export default router;