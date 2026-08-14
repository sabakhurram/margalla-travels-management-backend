import express from "express";

import {
  getCategories,
  createCategory,
  updateCategory,
   deleteCategory
} from "../controllers/categoryController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateUser, getCategories);
router.post("/", authenticateUser, createCategory);
router.patch("/:id", authenticateUser, updateCategory);
router.delete("/:id",authenticateUser,deleteCategory);
export default router;