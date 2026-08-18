import express from "express";

import {
  getCategories,
  createCategory,
  updateCategory,
   deleteCategory,
     getMonthlyLimit,
  saveMonthlyLimit,
} from "../controllers/categoryController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateUser, getCategories);
router.post("/", authenticateUser, createCategory);
router.patch("/:id", authenticateUser, updateCategory);
router.delete("/:id",authenticateUser,deleteCategory);
router.get("/:id/monthly-limit", authenticateUser, getMonthlyLimit);

router.post("/:id/monthly-limit", authenticateUser, saveMonthlyLimit);
export default router;