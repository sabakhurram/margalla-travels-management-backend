import express from "express";

import {
  getDrivers,
} from "../controllers/driverController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateUser, getDrivers);

export default router;