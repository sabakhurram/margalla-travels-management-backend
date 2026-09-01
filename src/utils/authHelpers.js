// utils/authHelpers.js

// Builds a synthetic, never-emailed-to address that satisfies
// Supabase Auth's requirement for an email identifier.
export const buildSyntheticEmail = (username) => {
  const cleanUsername = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, ""); // strip anything unsafe

  return `${cleanUsername}@margalla.internal`;
};

// Generates a short, human-typeable temporary password.
// Driver will be forced to change it on first login.
export const generateTempPassword = () => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let password = "";

  for (let i = 0; i < 10; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  return password;
};