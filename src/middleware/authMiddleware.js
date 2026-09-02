import { supabase } from "../config/supabase.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    // Get user profile
    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError || !profile) {
      return res.status(403).json({
        message: "User profile not found",
      });
    }

    // If the user is a driver, check driver status
    if (profile.role === "driver") {
      const { data: driver, error: driverError } =
        await supabaseAdmin
          .from("drivers")
          .select("id, status")
          .eq("user_id", user.id)
          .maybeSingle();

      if (driverError) {
        console.error(
          "Error checking driver status:",
          driverError
        );

        return res.status(500).json({
          message: "Failed to verify driver status",
        });
      }

      if (!driver || driver.status !== "active") {
        return res.status(403).json({
          message:
            "Your driver account is inactive. Please contact the administrator.",
        });
      }
    }

    req.user = user;
    req.accessToken = token;
    req.profile = profile;

    next();

  } catch (error) {
    console.error(
      "Authentication error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error during authentication",
    });
  }
};