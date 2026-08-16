import express from "express";

import {
  getDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
} from "../controllers/driverController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateUser, getDrivers);
router.post("/", authenticateUser, createDriver);
router.patch("/:id", authenticateUser, updateDriver);
router.delete("/:id", authenticateUser, deleteDriver);

export default router;