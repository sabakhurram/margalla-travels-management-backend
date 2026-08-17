import express from "express";

import {
  getMileageEntries,
  getMyVehicle,
  createMileageEntry,
} from "../controllers/mileageController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();


// Get mileage entries
router.get(
  "/",
  authenticateUser,
  getMileageEntries
);


// Get currently logged-in driver's vehicle
router.get(
  "/my-vehicle",
  authenticateUser,
  getMyVehicle
);


// Create mileage entry
router.post(
  "/",
  authenticateUser,
  createMileageEntry
);

export default router;