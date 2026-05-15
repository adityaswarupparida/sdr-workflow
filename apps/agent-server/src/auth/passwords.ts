// Bun.password defaults to argon2id — no library to install, no algorithm to pick.

export function hash(plain: string): Promise<string> {
  return Bun.password.hash(plain);
}

export function verify(plain: string, hashed: string): Promise<boolean> {
  return Bun.password.verify(plain, hashed);
}
