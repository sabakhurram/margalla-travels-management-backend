// middleware/requireAdmin.js
import { supabaseAdmin } from "../config/supabaseAdmin.js";

// Run this AFTER your existing authenticateUser middleware —
// it depends on req.user already being set.
export const requireAdmin = async (req, res, next) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) {
      console.error("Error checking admin role:", error);
      return res.status(500).json({ message: "Server error" });
    }

    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  } catch (error) {
    console.error("requireAdmin error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};