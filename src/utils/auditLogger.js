import { supabaseAdmin } from "../config/supabaseAdmin.js";
export const createAuditLog = async ({
  supabase,
  userId,
  action,
  tableName,
  recordId,
  oldValue = null,
  newValue = null,
}) => {
  try {
   const { error } = await supabaseAdmin
  .from("audit_logs")
  .insert([
    {
      user_id: userId,
      action,
      table_name: tableName,
      record_id: recordId,
      old_value: oldValue,
      new_value: newValue,
    },
  ]);

if (error) {
  console.error(
    "Error creating audit log:",
    error
  );
}
  } catch (error) {
    console.error(
      "Audit logger error:",
      error
    );
  }
};