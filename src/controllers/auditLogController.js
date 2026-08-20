import { createUserSupabaseClient } from "../config/supabaseUser.js";

export const getAuditLogs = async (req, res) => {
  try {
    const userSupabase = createUserSupabaseClient(
      req.accessToken
    );

    const { data, error } = await userSupabase
      .from("audit_logs")
     .select(`
  id,
  user_id,
  action,
  table_name,
  record_id,
  old_value,
  new_value,
  created_at,

  profiles (
    name
  )
`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "Error fetching audit logs:",
        error
      );

      return res.status(500).json({
        message: "Failed to fetch audit logs",
      });
    }

    return res.status(200).json({
      auditLogs: data || [],
    });
  } catch (error) {
    console.error(
      "Get audit logs error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while fetching audit logs",
    });
  }
};