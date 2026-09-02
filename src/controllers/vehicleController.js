import { createUserSupabaseClient } from "../config/supabaseUser.js";
import { createAuditLog } from "../utils/auditLogger.js";

export const getVehicles = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(req.accessToken);
    /*
--------------------------------------------
Ensure driver is assigned to only one vehicle
--------------------------------------------
*/

    const { data, error } = await userSupabase
      .from("vehicles")
      .select(`
        id,
        registration_number,
        model,
        category_id,
        assigned_driver_id,
        status,
        created_at,
        categories (
          id,
          name
        ),
        drivers (
          id,
          name
        )
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching vehicles:", error);

      return res.status(500).json({
        message: "Failed to fetch vehicles",
      });
    }

    res.status(200).json({
      vehicles: data,
    });
  } catch (error) {
    console.error("Get vehicles error:", error);

    res.status(500).json({
      message: "Server error while fetching vehicles",
    });
  }
  
};
export const createVehicle = async (req, res) => {
  try {
    const {
      registration_number,
      model,
      category_id,
      assigned_driver_id,
      status,
    } = req.body;

    if (!registration_number || !registration_number.trim()) {
      return res.status(400).json({
        message: "Registration number is required",
      });
    }

    if (!model || !model.trim()) {
      return res.status(400).json({
        message: "Vehicle model is required",
      });
    }

    if (!category_id) {
      return res.status(400).json({
        message: "Category is required",
      });
    }

    if (!status || !status.trim()) {
      return res.status(400).json({
        message: "Vehicle status is required",
      });
    }

    const userSupabase = createUserSupabaseClient(req.accessToken);

    // Check if registration number already exists
    const { data: existingVehicle, error: existingError } =
      await userSupabase
        .from("vehicles")
        .select("id")
        .ilike("registration_number", registration_number.trim())
        .maybeSingle();

    if (existingError) {
      console.error(
        "Error checking existing vehicle:",
        existingError
      );

      return res.status(500).json({
        message: "Failed to check vehicle",
      });
    }

    if (existingVehicle) {
      return res.status(409).json({
        message: "Vehicle with this registration number already exists",
      });
    }
// Check if driver is already assigned to another vehicle
if (assigned_driver_id) {
  const { data: assignedVehicle, error: assignedVehicleError } =
    await userSupabase
      .from("vehicles")
      .select("id, registration_number")
      .eq("assigned_driver_id", assigned_driver_id)
      .maybeSingle();

  if (assignedVehicleError) {
    console.error(
      "Error checking driver assignment:",
      assignedVehicleError
    );

    return res.status(500).json({
      message: "Failed to check driver assignment",
    });
  }

  if (assignedVehicle) {
    return res.status(400).json({
      message: `This driver is already assigned to vehicle ${assignedVehicle.registration_number}`,
    });
  }
}
    const { data, error } = await userSupabase
      .from("vehicles")
      .insert([
        {
          registration_number: registration_number.trim(),
          model: model.trim(),
          category_id,
          assigned_driver_id: assigned_driver_id || null,
          status: status.trim(),
        },
      ])
      .select(`
        id,
        registration_number,
        model,
        category_id,
        assigned_driver_id,
        status,
        created_at,
        categories (
          id,
          name
        ),
        drivers (
          id,
          name
        )
      `)
      .single();

    if (error) {
      console.error("Error creating vehicle:", error);

      return res.status(500).json({
        message: "Failed to create vehicle",
      });
    }
    console.log("AUDIT USER:", req.user);
console.log("AUDIT USER ID:", req.user?.id);

await createAuditLog({
  supabase: userSupabase,
  userId: req.user.id,
  action: "CREATE",
  tableName: "vehicles",
  recordId: data.id,
  oldValue: null,
  newValue: data,
});
res.status(201).json({
      message: "Vehicle created successfully",
      vehicle: data,
    });
  } catch (error) {
    console.error("Create vehicle error:", error);

    res.status(500).json({
      message: "Server error while creating vehicle",
    });
  }
};
export const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      registration_number,
      model,
      category_id,
      assigned_driver_id,
      status,
    } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Vehicle ID is required",
      });
    }

    if (!registration_number || !registration_number.trim()) {
      return res.status(400).json({
        message: "Registration number is required",
      });
    }

    if (!model || !model.trim()) {
      return res.status(400).json({
        message: "Vehicle model is required",
      });
    }

    if (!category_id) {
      return res.status(400).json({
        message: "Category is required",
      });
    }

    if (!status) {
      return res.status(400).json({
        message: "Vehicle status is required",
      });
    }

    const userSupabase = createUserSupabaseClient(
      
      req.accessToken
    );
const {
  data: oldVehicle,
  error: oldVehicleError,
} = await userSupabase
  .from("vehicles")
  .select(`
    id,
    registration_number,
    model,
    category_id,
    assigned_driver_id,
    status
  `)
  .eq("id", id)
  .maybeSingle();

if (oldVehicleError) {
  console.error(
    "Error fetching vehicle before update:",
    oldVehicleError
  );

  return res.status(500).json({
    message: "Failed to fetch vehicle",
  });
}

if (!oldVehicle) {
  return res.status(404).json({
    message: "Vehicle not found",
  });
}
    // Check if another vehicle already uses this
    // registration number
    const { data: existingVehicle, error: existingError } =
      await userSupabase
        .from("vehicles")
        .select("id, registration_number")
        .ilike(
          "registration_number",
          registration_number.trim()
        )
        .neq("id", id)
        .maybeSingle();

    if (existingError) {
      console.error(
        "Error checking existing vehicle:",
        existingError
      );

      return res.status(500).json({
        message: "Failed to check vehicle",
      });
    }

    if (existingVehicle) {
      return res.status(409).json({
        message: "Registration number already exists",
      });
    }
/*
--------------------------------------------
Ensure driver is assigned to only one vehicle
--------------------------------------------
*/

if (assigned_driver_id) {
  const { error: unassignError } = await userSupabase
    .from("vehicles")
    .update({
      assigned_driver_id: null,
    })
    .eq("assigned_driver_id", assigned_driver_id)
    .neq("id", id);

  if (unassignError) {
    console.error(
      "Error removing driver from previous vehicle:",
      unassignError
    );

    return res.status(500).json({
      message:
        "Failed to update driver vehicle assignment",
    });
  }
}
    const { data, error } = await userSupabase
      .from("vehicles")
      .update({
        registration_number:
          registration_number.trim(),
        model: model.trim(),
        category_id,
        assigned_driver_id:
          assigned_driver_id || null,
        status,
      })
      .eq("id", id)
      .select(`
        id,
        registration_number,
        model,
        category_id,
        assigned_driver_id,
        status,
        created_at
      `)
      .single();

    if (error) {
      console.error("Error updating vehicle:", error);

      return res.status(500).json({
        message: "Failed to update vehicle",
      });
    }
await createAuditLog({
  supabase: userSupabase,
  userId: req.user.id,
  action: "UPDATE",
  tableName: "vehicles",
  recordId: data.id,
  oldValue: oldVehicle,
  newValue: data,
});
    res.status(200).json({
      message: "Vehicle updated successfully",
      vehicle: data,
    });
  } catch (error) {
    console.error("Update vehicle error:", error);

    res.status(500).json({
      message: "Server error while updating vehicle",
    });
  }
};
export const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "Vehicle ID is required",
      });
    }

    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    // Get vehicle before deletion
    const {
      data: vehicleToDelete,
      error: fetchError,
    } = await userSupabase
      .from("vehicles")
      .select(`
        id,
        registration_number,
        model,
        category_id,
        assigned_driver_id,
        status
      `)
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error(
        "Error fetching vehicle before deletion:",
        fetchError
      );

      return res.status(500).json({
        message: "Failed to fetch vehicle",
      });
    }

    if (!vehicleToDelete) {
      return res.status(404).json({
        message: "Vehicle not found",
      });
    }

    // Delete vehicle
    const { data, error } = await userSupabase
      .from("vehicles")
      .delete()
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      console.error("Error deleting vehicle:", error);

      // Foreign key constraint error
      if (error.code === "23503") {
        return res.status(409).json({
          message:
            "Cannot delete this vehicle because it has related mileage records.",
        });
      }

      return res.status(500).json({
        message: "Failed to delete vehicle",
      });
    }

    if (!data) {
      return res.status(404).json({
        message: "Vehicle not found",
      });
    }

    // Create audit log
    await createAuditLog({
      supabase: userSupabase,
      userId: req.user.id,
      action: "DELETE",
      tableName: "vehicles",
      recordId: id,
      oldValue: vehicleToDelete,
      newValue: null,
    });

    return res.status(200).json({
      message: "Vehicle deleted successfully",
      vehicleId: data.id,
    });

  } catch (error) {
    console.error("Delete vehicle error:", error);

    return res.status(500).json({
      message: "Server error while deleting vehicle",
    });
  }
};