import express from "express";

import {
  getDrivers,
  createDriver,
} from "../controllers/driverController.js";

const router = express.Router();

router.get("/", getDrivers);
router.post("/", createDriver);

export default router;