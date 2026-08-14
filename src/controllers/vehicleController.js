import { supabase } from "../config/supabase.js";

export const getVehicles = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vehicles")
      .select(`
        id,
        registration_number,
        model,
        status,
        created_at,
        category:categories (
          id,
          name
        ),
        driver:drivers (
          id,
          name,
          phone,
          status
        )
      `)
      .order("created_at", { ascending: false });

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

    // Basic validation
    if (!registration_number || !model || !category_id || !status) {
      return res.status(400).json({
        message:
          "Registration number, model, category, and status are required",
      });
    }

    // Check if registration number already exists
    const { data: existingVehicle, error: existingError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("registration_number", registration_number)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking vehicle:", existingError);

      return res.status(500).json({
        message: "Failed to validate vehicle",
      });
    }

    if (existingVehicle) {
      return res.status(409).json({
        message: "A vehicle with this registration number already exists",
      });
    }

    // Insert vehicle
    const { data, error } = await supabase
      .from("vehicles")
      .insert([
        {
          registration_number,
          model,
          category_id,
          assigned_driver_id: assigned_driver_id || null,
          status,
        },
      ])
      .select(`
        id,
        registration_number,
        model,
        status,
        created_at,
        category:categories (
          id,
          name
        ),
        driver:drivers (
          id,
          name,
          phone,
          status
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