import { supabase } from "../config/supabase.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { buildSyntheticEmail, generateTempPassword } from "../utils/authHelpers.js";

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ message: "Username is required" });
    }
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const normalizedUsername = username.trim().toLowerCase();
console.log("Login username:", normalizedUsername);
    const { data: profile, error: profileError } = await supabaseAdmin
  
      .from("profiles")
      .select("id, username, role, email")
      .eq("username", normalizedUsername)
      .maybeSingle();

console.log("Profile found:", profile);
console.log("Profile error:", profileError);
    if (profileError) {
      console.error("Error looking up username:", profileError);
      return res.status(500).json({ message: "Server error during login" });
    }

    if (!profile || !profile.email) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Use the ACTUAL stored email — never recompute it.
    // This works correctly whether the account uses a real
    // email (admins) or a synthetic one (drivers).
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });
console.log("Login email being used:", profile.email);
    if (authError) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    return res.status(200).json({
      session: authData.session,
      user: authData.user,
      role: profile.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Server error during login" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ message: "Username is required" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, role, email")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (profileError) {
      console.error("Error looking up username:", profileError);
      return res.status(500).json({ message: "Server error" });
    }

    // Same generic response either way — don't reveal
    // whether a username exists to an unauthenticated caller.
    const genericResponse = {
      message:
        "If this account can receive email, a reset link has been sent. Drivers should contact their administrator to reset their password.",
    };

    if (!profile) {
      return res.status(200).json(genericResponse);
    }

    // Only send real reset emails to accounts with a real,
    // non-synthetic email — i.e. admins/managers, not drivers.
    const isSyntheticEmail = profile.email?.endsWith("@margalla.internal");

    if (profile.role !== "driver" && !isSyntheticEmail) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        profile.email,
        {
          redirectTo: `${process.env.FRONTEND_URL || "http://localhost:5173"}/set-password`,
        }
      );

      if (resetError) {
        console.error("Error sending reset email:", resetError);
        // Still return generic response — don't leak details.
      }
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};