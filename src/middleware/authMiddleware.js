import { supabase } from "../config/supabase.js";

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    console.log("Token exists:", !!token);
    console.log("Token parts:", token?.split(".").length);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }
    req.user = user;
    req.accessToken = token;

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(500).json({
      message: "Server error during authentication",
    });
  }
};