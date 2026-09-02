import { createUserSupabaseClient } from "../config/supabaseUser.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { createAuditLog } from "../utils/auditLogger.js";
import { buildSyntheticEmail, generateTempPassword } from "../utils/authHelpers.js";

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
        username,
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
    const { name, phone, username, status } = req.body;

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

    if (!username || !username.trim()) {
      return res.status(400).json({
        message: "Driver username is required",
      });
    }

    if (!status || !status.trim()) {
      return res.status(400).json({
        message: "Driver status is required",
      });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const syntheticEmail = buildSyntheticEmail(normalizedUsername);
    const tempPassword = generateTempPassword();

    // -----------------------------
    // Create Supabase Auth user directly
    // (no invite email sent — account is active immediately)
    // -----------------------------
    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password: tempPassword,
      email_confirm: true, // skips confirmation step entirely
      user_metadata: {
        name: name.trim(),
        role: "driver",
        username: normalizedUsername,
        must_reset_password: true,
      },
    });

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
    // Create/update the profiles row
    // (this is what login looks up — required)
    // -----------------------------
   const { error: profileError } = await supabaseAdmin
  .from("profiles")
  .upsert({
    id: createdAuthUserId,
    name: name.trim(),
    email: syntheticEmail,
    role: "driver",
    username: normalizedUsername,
    is_active: true,
  });

    if (profileError) {
      console.error("Error creating profile:", profileError);

      await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
      createdAuthUserId = null;

      return res.status(500).json({
        message: "Failed to create driver profile",
      });
    }

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
          username: normalizedUsername,
          status: status.trim(),
        },
      ])
      .select(`
        id,
        user_id,
        name,
        phone,
        username,
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

    await createAuditLog({
      supabase: userSupabase,
      userId: req.user.id,
      action: "CREATE",
      tableName: "drivers",
      recordId: data.id,
      oldValue: null,
      newValue: data,
    });

    return res.status(201).json({
      message: "Driver created successfully.",
      driver: data,
      tempPassword, // shown once in the UI, never stored in plaintext anywhere else
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

export const resetDriverPassword = async (req, res) => {
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

    const {
      data: driver,
      error: driverError,
    } = await userSupabase
      .from("drivers")
      .select("id, user_id, name, status")
      .eq("id", id)
      .maybeSingle();

    if (driverError) {
      console.error("Error fetching driver:", driverError);
      return res.status(500).json({
        message: "Failed to fetch driver",
      });
    }

    if (!driver) {
      return res.status(404).json({
        message: "Driver not found",
      });
    }

    if (!driver.user_id) {
      return res.status(400).json({
        message:
          "This driver does not have a linked authentication account",
      });
    }

    const newTempPassword = generateTempPassword();

    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(
        driver.user_id,
        {
          password: newTempPassword,
          user_metadata: { must_reset_password: true },
        }
      );

    if (updateError) {
      console.error(
        "Error resetting driver password:",
        updateError
      );

      return res.status(500).json({
        message: "Failed to reset password",
      });
    }

    return res.status(200).json({
      message: "Password reset successfully.",
      tempPassword: newTempPassword,
    });
  } catch (error) {
    console.error(
      "Reset driver password error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while resetting password",
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

    const {
      data: oldDriver,
      error: fetchError,
    } = await userSupabase
      .from("drivers")
      .select(`
        id,
        user_id,
        name,
        phone,
        status,
        created_at
      `)
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error(
        "Error fetching driver before update:",
        fetchError
      );

      return res.status(500).json({
        message: "Failed to fetch driver",
      });
    }

    if (!oldDriver) {
      return res.status(404).json({
        message: "Driver not found",
      });
    }

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
        username,
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

    // Keep the profiles table's name in sync too,
    // since it's a separate copy used for login/role lookups.
    if (oldDriver.user_id) {
      const { error: profileUpdateError } = await supabaseAdmin
        .from("profiles")
        .update({ name: name.trim() })
        .eq("id", oldDriver.user_id);

      if (profileUpdateError) {
        console.error(
          "Error syncing profile name:",
          profileUpdateError
        );
        // Not fatal — driver record already updated successfully.
      }
    }

    await createAuditLog({
      supabase: userSupabase,
      userId: req.user.id,
      action: "UPDATE",
      tableName: "drivers",
      recordId: id,
      oldValue: oldDriver,
      newValue: data,
    });

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

    // -----------------------------------
    // Check whether the driver has a vehicle assigned
    // -----------------------------------
    const {
      data: assignedVehicle,
      error: vehicleError,
    } = await userSupabase
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
          "Cannot delete this driver because a vehicle is assigned to them.",
      });
    }

    // -----------------------------------
    // Get driver before deletion
    // -----------------------------------
    const {
      data: oldDriver,
      error: fetchError,
    } = await userSupabase
      .from("drivers")
      .select(`
        id,
        user_id,
        name,
        phone,
        status,
        created_at
      `)
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error(
        "Error fetching driver before delete:",
        fetchError
      );

      return res.status(500).json({
        message: "Failed to fetch driver",
      });
    }

    if (!oldDriver) {
      return res.status(404).json({
        message: "Driver not found",
      });
    }

    // -----------------------------------
    // Delete driver
    // -----------------------------------
    const { data, error } = await userSupabase
      .from("drivers")
      .delete()
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      console.error("Error deleting driver:", error);

      // Foreign key constraint
      if (error.code === "23503") {
        return res.status(409).json({
          message:
            "Cannot delete this driver because they have related records or mileage history.",
        });
      }

      return res.status(500).json({
        message: "Failed to delete driver",
      });
    }

    // -----------------------------------
    // Delete linked Supabase Auth account
    // -----------------------------------
    if (oldDriver.user_id) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(
          oldDriver.user_id
        );
      } catch (authDeleteError) {
        console.error(
          "Failed to delete linked Auth account:",
          authDeleteError
        );

        // Driver record was deleted successfully,
        // so we only log the Auth deletion failure.
      }
    }

    // -----------------------------------
    // Create audit log AFTER successful deletion
    // -----------------------------------
    await createAuditLog({
      supabase: userSupabase,
      userId: req.user.id,
      action: "DELETE",
      tableName: "drivers",
      recordId: id,
      oldValue: oldDriver,
      newValue: null,
    });

    return res.status(200).json({
      message: "Driver deleted successfully",
      driverId: data.id,
    });

  } catch (error) {
    console.error("Delete driver error:", error);

    return res.status(500).json({
      message: "Server error while deleting driver",
    });
  }
};
