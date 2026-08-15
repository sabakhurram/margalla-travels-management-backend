import { createUserSupabaseClient } from "../config/supabaseUser.js";

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