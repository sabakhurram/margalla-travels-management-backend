import { supabase } from "../config/supabase.js";

export const getDrivers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("drivers")
      .select(`
        id,
        user_id,
        name,
        phone,
        status,
        created_at
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
  try {
    const {
      user_id,
      name,
      phone,
      status,
    } = req.body;

    if (!user_id || !name || !phone || !status) {
      return res.status(400).json({
        message: "user_id, name, phone, and status are required",
      });
    }

    // Check if the user already has a driver record
    const { data: existingDriver, error: existingError } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking driver:", existingError);

      return res.status(500).json({
        message: "Failed to check existing driver",
      });
    }

    if (existingDriver) {
      return res.status(409).json({
        message: "This user is already registered as a driver",
      });
    }

    const { data, error } = await supabase
      .from("drivers")
      .insert([
        {
          user_id,
          name: name.trim(),
          phone: phone.trim(),
          status,
        },
      ])
      .select(`
        id,
        user_id,
        name,
        phone,
        status,
        created_at
      `)
      .single();

    if (error) {
      console.error("Error creating driver:", error);

      return res.status(500).json({
        message: "Failed to create driver",
      });
    }

    res.status(201).json({
      message: "Driver created successfully",
      driver: data,
    });
  } catch (error) {
    console.error("Create driver error:", error);

    res.status(500).json({
      message: "Server error while creating driver",
    });
  }
};