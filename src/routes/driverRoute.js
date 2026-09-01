import express from "express";

import {
  getDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
  resetDriverPassword,
    
} from "../controllers/driverController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateUser, getDrivers);

router.post("/", authenticateUser, createDriver);

router.put("/:id", authenticateUser, updateDriver);

router.delete("/:id", authenticateUser, deleteDriver);

// Reset driver's password
router.post(
  "/:id/reset-password",
  authenticateUser,
  resetDriverPassword
);

export default router;