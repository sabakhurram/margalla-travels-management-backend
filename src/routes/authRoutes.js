import express from "express";

import {
  login,
  forgotPassword,
} from "../controllers/authController.js";

import {
  createAdmin,
  getAdmins,
} from "../controllers/adminController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

router.post("/login", login);

router.post("/forgot-password", forgotPassword);

router.get(
  "/admins",
  authenticateUser,
  requireAdmin,
  getAdmins
);

router.post(
  "/create-admin",
  authenticateUser,
  requireAdmin,
  createAdmin
);

export default router;