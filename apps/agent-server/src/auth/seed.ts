import { createUser, hasAnyAdmin } from "../db/store.js";
import { hash } from "./passwords.js";

/** Bootstrap the first admin from env vars on startup. Idempotent. */
export async function seedAdmin(): Promise<void> {
  if (hasAnyAdmin()) {
    console.log("[Auth] Admin already exists — bootstrap skipped");
    return;
  }
  const username = process.env["ADMIN_USERNAME"];
  const password = process.env["ADMIN_PASSWORD"];
  if (!username || !password) {
    console.warn("[Auth] No admin user found and ADMIN_USERNAME / ADMIN_PASSWORD are not set — login will be impossible until you configure them and restart.");
    return;
  }
  await createUser(username, await hash(password), "admin");
  console.log(`[Auth] First admin created — username: "${username}". Change the password after first login.`);
}
