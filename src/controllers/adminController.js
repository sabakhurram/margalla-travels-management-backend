// controllers/adminController.js
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { generateTempPassword } from "../utils/authHelpers.js";

export const getAdmins = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, username, email, role, is_active, created_at")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
 
    if (error) {
      console.error("Error fetching admins:", error);
      return res.status(500).json({ message: "Failed to fetch admins" });
    }
 
    res.status(200).json({ admins: data });
  } catch (error) {
    console.error("Get admins error:", error);
    res.status(500).json({ message: "Server error while fetching admins" });
  }
};
 
export const createAdmin = async (req, res) => {
  let createdAuthUserId = null;

  try {
    const { name, username, email, role } = req.body;

    // -----------------------------
    // Validate input
    // -----------------------------
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!username || !username.trim()) {
      return res.status(400).json({ message: "Username is required" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({
        message: "A real email is required for admin/manager accounts (used for password recovery)",
      });
    }

    const allowedRoles = ["admin"];
    const normalizedRole = "admin";

    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const tempPassword = generateTempPassword();

    // -----------------------------
    // Create Supabase Auth user directly with a REAL email
    // -----------------------------
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          name: name.trim(),
          role: normalizedRole,
          username: normalizedUsername,
          must_reset_password: true,
        },
      });

    if (authError) {
      console.error("Error creating admin Auth account:", authError);
      return res.status(400).json({
        message: authError.message || "Failed to create account",
      });
    }

    createdAuthUserId = authData.user.id;

    // -----------------------------
    // Create the profiles row
    // -----------------------------
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: createdAuthUserId,
        name: name.trim(),
        role: normalizedRole,
        username: normalizedUsername,
        email: normalizedEmail,
        is_active: true,
      });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
      createdAuthUserId = null;
      return res.status(500).json({ message: "Failed to create profile" });
    }

    return res.status(201).json({
      message: "Account created successfully.",
      tempPassword, // shown once — this admin has a real email too, so you could optionally email it instead
    });
  } catch (error) {
    console.error("Create admin error:", error);

    if (createdAuthUserId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
      } catch (rollbackError) {
        console.error("Failed to rollback Auth user:", rollbackError);
      }
    }

    return res.status(500).json({ message: "Server error while creating account" });
  }
};
export const resetAdminPassword = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: admin, error: adminError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, role")
      .eq("id", id)
      .eq("role", "admin")
      .single();

    if (adminError || !admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    const tempPassword = generateTempPassword();

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(id);

    if (authError || !authData.user) {
      return res.status(404).json({
        message: "Admin authentication account not found",
      });
    }

    const existingMetadata =
      authData.user.user_metadata || {};

    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(id, {
        password: tempPassword,
        user_metadata: {
          ...existingMetadata,
          must_reset_password: true,
        },
      });

    if (updateError) {
      console.error(
        "Reset admin password error:",
        updateError
      );

      return res.status(500).json({
        message: "Failed to reset admin password",
      });
    }

    return res.status(200).json({
      message: "Password reset successfully",
      tempPassword,
      adminName: admin.name,
    });

  } catch (error) {
    console.error(
      "Reset admin password error:",
      error
    );

    return res.status(500).json({
      message: "Server error while resetting password",
    });
  }
};
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent an admin from deleting themselves
    if (req.user.id === id) {
      return res.status(400).json({
        message: "You cannot delete your own admin account",
      });
    }

    // Check that this is actually an admin
    const { data: admin, error: adminError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, name, role")
        .eq("id", id)
        .eq("role", "admin")
        .single();

    if (adminError || !admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    // Delete Supabase Auth user
    const { error: deleteAuthError } =
      await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteAuthError) {
      console.error(
        "Error deleting admin Auth user:",
        deleteAuthError
      );

      return res.status(500).json({
        message: "Failed to delete admin account",
      });
    }

    // Delete profile
    const { error: deleteProfileError } =
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", id);

    if (deleteProfileError) {
      console.error(
        "Error deleting admin profile:",
        deleteProfileError
      );

      return res.status(500).json({
        message: "Admin authentication account was deleted, but profile deletion failed",
      });
    }

    return res.status(200).json({
      message: "Admin deleted successfully",
    });

  } catch (error) {
    console.error("Delete admin error:", error);

    return res.status(500).json({
      message: "Server error while deleting admin",
    });
  }
};