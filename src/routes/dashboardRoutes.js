import express from "express";

import {
  getDashboardOverview,
} from "../controllers/dashboardController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/overview",
  authenticateUser,
  getDashboardOverview
);

export default router;