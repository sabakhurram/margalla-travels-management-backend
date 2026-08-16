import { createUserSupabaseClient } from "../config/supabaseUser.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";

export const getDrivers = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(req.accessToken);

    const { data, error } = await userSupabase
      .from("drivers")
      .select(`
        id,
        user_id,
        name,
        phone,
        status,
        created_at,
        vehicles (
          id,
          registration_number,
          model
        )
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching drivers:", error);

      return res.status(500).json({
        message: "Failed to fetch drivers",
      });
    }

    res.status(200).json({
      drivers: data,
    });
  } catch (error) {
    console.error("Get drivers error:", error);

    res.status(500).json({
      message: "Server error while fetching drivers",
    });
  }
};


export const createDriver = async (req, res) => {
  let createdAuthUserId = null;

  try {
    const {
      name,
      phone,
      email,
      status,
    } = req.body;

    // -----------------------------
    // Validate input
    // -----------------------------

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Driver name is required",
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        message: "Driver phone is required",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        message: "Driver email is required",
      });
    }

    if (!status || !status.trim()) {
      return res.status(400).json({
        message: "Driver status is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // -----------------------------
    // Create Supabase Auth user
    // -----------------------------

   const {
  data: authData,
  error: authError,
} = await supabaseAdmin.auth.admin.inviteUserByEmail(
  normalizedEmail,
  {
    redirectTo: "http://localhost:5173/set-password",
    data: {
      name: name.trim(),
      role: "driver",
    },
  }
);

    if (authError) {
      console.error(
        "Error creating driver Auth account:",
        authError
      );

      return res.status(400).json({
        message:
          authError.message ||
          "Failed to create driver account",
      });
    }

    createdAuthUserId = authData.user.id;

    // -----------------------------
    // Create driver database record
    // -----------------------------

    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    const {
      data,
      error,
    } = await userSupabase
      .from("drivers")
      .insert([
        {
          user_id: createdAuthUserId,
          name: name.trim(),
          phone: phone.trim(),
          status: status.trim(),
        },
      ])
      .select(`
        id,
        user_id,
        name,
        phone,
        status,
        created_at,
        vehicles (
          id,
          registration_number,
          model
        )
      `)
      .single();

    // -----------------------------
    // Roll back Auth user if DB
    // insert fails
    // -----------------------------

    if (error) {
      console.error(
        "Error creating driver record:",
        error
      );

      await supabaseAdmin.auth.admin.deleteUser(
        createdAuthUserId
      );

      createdAuthUserId = null;

      return res.status(500).json({
        message: "Failed to create driver",
      });
    }

    // -----------------------------
    // Success
    // -----------------------------

    return res.status(201).json({
      message:
        "Driver created successfully. An invitation email has been sent.",
      driver: data,
    });
  } catch (error) {
    console.error(
      "Create driver error:",
      error
    );

    // Safety rollback
    if (createdAuthUserId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(
          createdAuthUserId
        );
      } catch (rollbackError) {
        console.error(
          "Failed to rollback Auth user:",
          rollbackError
        );
      }
    }

    return res.status(500).json({
      message:
        "Server error while creating driver",
    });
  }
};

export const updateDriver = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      phone,
      status,
    } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Driver ID is required",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Driver name is required",
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        message: "Driver phone is required",
      });
    }

    if (!status || !status.trim()) {
      return res.status(400).json({
        message: "Driver status is required",
      });
    }

    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    const { data, error } = await userSupabase
      .from("drivers")
      .update({
        name: name.trim(),
        phone: phone.trim(),
        status: status.trim(),
      })
      .eq("id", id)
      .select(`
        id,
        user_id,
        name,
        phone,
        status,
        created_at,
        vehicles (
          id,
          registration_number,
          model
        )
      `)
      .single();

    if (error) {
      console.error("Error updating driver:", error);

      return res.status(500).json({
        message: "Failed to update driver",
      });
    }

    res.status(200).json({
      message: "Driver updated successfully",
      driver: data,
    });
  } catch (error) {
    console.error("Update driver error:", error);

    res.status(500).json({
      message: "Server error while updating driver",
    });
  }
};


export const deleteDriver = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "Driver ID is required",
      });
    }

    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    // Check whether the driver has a vehicle assigned
    const { data: assignedVehicle, error: vehicleError } =
      await userSupabase
        .from("vehicles")
        .select("id")
        .eq("assigned_driver_id", id)
        .maybeSingle();

    if (vehicleError) {
      console.error(
        "Error checking assigned vehicle:",
        vehicleError
      );

      return res.status(500).json({
        message: "Failed to check driver's vehicle",
      });
    }

    if (assignedVehicle) {
      return res.status(409).json({
        message:
          "Cannot delete driver while a vehicle is assigned to them",
      });
    }

    const { data, error } = await userSupabase
      .from("drivers")
      .delete()
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      console.error("Error deleting driver:", error);

      return res.status(500).json({
        message: "Failed to delete driver",
      });
    }

    if (!data) {
      return res.status(404).json({
        message: "Driver not found",
      });
    }

    res.status(200).json({
      message: "Driver deleted successfully",
      driverId: data.id,
    });
  } catch (error) {
    console.error("Delete driver error:", error);

    res.status(500).json({
      message: "Server error while deleting driver",
    });
  }
};