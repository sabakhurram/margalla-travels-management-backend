import express from "express";

import {
  startOutstationTrip,
    verifyOutstationArrival,
      getActiveOutstationTrip,
        completeOutstationTrip,
          getMyOutstationHistory,
          getAllOutstationTrips,
} from "../controllers/outstationController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Start a new outstation trip
router.post(
  "/start",
  authenticateUser,
  startOutstationTrip
);
// Verify driver's arrival at destination
router.post(
  "/:tripId/arrival-location",
  authenticateUser,
  verifyOutstationArrival
);
router.get(
  "/admin",
  authenticateUser,
  getAllOutstationTrips
);
// Get driver's active outstation trip
router.get(
  "/active",
  authenticateUser,
  getActiveOutstationTrip
);
// Complete a location-verified outstation trip
router.post(
  "/:tripId/complete",
  authenticateUser,
  completeOutstationTrip
);
router.get(
  "/my-history",
  authenticateUser,
  getMyOutstationHistory
);
export default router;