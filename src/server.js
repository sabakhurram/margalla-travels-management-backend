import express from "express";
import cors from "cors";

import vehicleRoutes from "./routes/vehicleRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import driverRoutes from "./routes/driverRoute.js";
import mileageRoutes from "./routes/mileageRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/categories", categoryRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/mileage", mileageRoutes);
app.get("/", (req, res) => {
  res.json({
    message: "Margalla Travels API is running",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});