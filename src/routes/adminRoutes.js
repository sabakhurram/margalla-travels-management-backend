import express from "express";

import {
  createAdmin,
  getAdmins,
} from "../controllers/adminController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

// Get all admins
router.get(
  "/",
  authenticateUser,
  requireAdmin,
  getAdmins
);

// Create a new admin
router.post(
  "/",
  authenticateUser,
  requireAdmin,
  createAdmin
);

export default router;