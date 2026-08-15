import express from "express";

import {
  getVehicles,
  createVehicle,
  updateVehicle,
    deleteVehicle,
} from "../controllers/vehicleController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateUser, getVehicles);

router.post("/", authenticateUser, createVehicle);

router.patch("/:id", authenticateUser, updateVehicle);

router.delete("/:id", authenticateUser, deleteVehicle);

export default router;