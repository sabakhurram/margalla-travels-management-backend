import express from "express";

import {
  getVehicles,
    createVehicle,
} from "../controllers/vehicleController.js";

const router = express.Router();

router.get("/", getVehicles);
router.post("/", createVehicle);

export default router;