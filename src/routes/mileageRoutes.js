import express from "express";

import {
  getMileageEntries,
  getMyVehicle,
  getDriverDashboard,
  createMileageEntry,
  getMyMileageHistory,
  getMileageMonitoring,
} from "../controllers/mileageController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get logged-in driver's dashboard summary

router.get(
  "/my-dashboard",
  authenticateUser,
  getDriverDashboard
);
// Get mileage monitoring for all vehicles

router.get(
  "/monitoring",
  authenticateUser,
  getMileageMonitoring
);
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
// Get logged-in driver's mileage history

router.get(
  "/my-history",
  authenticateUser,
  getMyMileageHistory
);
export default router;