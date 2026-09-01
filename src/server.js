import express from "express";
import cors from "cors";

import vehicleRoutes from "./routes/vehicleRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import driverRoutes from "./routes/driverRoute.js";
import mileageRoutes from "./routes/mileageRoutes.js";
import auditLogRoutes from "./routes/auditLogRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/vehicles", vehicleRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/mileage", mileageRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admins", adminRoutes);
app.get("/", (req, res) => {
  res.json({
    message: "Margalla Travels API is running",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});