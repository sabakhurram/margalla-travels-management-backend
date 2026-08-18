import { createUserSupabaseClient } from "../config/supabaseUser.js";

export const getVehicles = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(req.accessToken);

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

    const { data, error } = await userSupabase
      .from("vehicles")
      .delete()
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      console.error("Error deleting vehicle:", error);

      return res.status(500).json({
        message: "Failed to delete vehicle",
      });
    }

    if (!data) {
      return res.status(404).json({
        message: "Vehicle not found",
      });
    }

    res.status(200).json({
      message: "Vehicle deleted successfully",
      vehicleId: data.id,
    });
  } catch (error) {
    console.error("Delete vehicle error:", error);

    res.status(500).json({
      message: "Server error while deleting vehicle",
    });
  }
};