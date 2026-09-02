import express from "express";

import {
  createAdmin,
  getAdmins,
  resetAdminPassword,
  deleteAdmin,
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
// Reset admin password
router.put(
  "/:id/reset-password",
  authenticateUser,
  requireAdmin,
  resetAdminPassword
);

// Delete admin
router.delete(
  "/:id",
  authenticateUser,
  requireAdmin,
  deleteAdmin
);
export default router;