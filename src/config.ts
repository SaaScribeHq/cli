import { chmod, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Where the CLI talks to. Point it at another environment with SAASCRIBE_API_URL.
export const API_URL = (process.env.SAASCRIBE_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

export const CONFIG_DIR = join(homedir(), ".saascribe");
export const TOKEN_PATH = join(CONFIG_DIR, "token");

export async function readToken() {
  const file = Bun.file(TOKEN_PATH);
  if (!(await file.exists())) return null;
  return (await file.text()).trim() || null;
}

// The API key is a secret: only the current user can read it.
export async function saveToken(token: string) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await Bun.write(TOKEN_PATH, `${token}\n`);
  await chmod(TOKEN_PATH, 0o600);
}

export async function deleteToken() {
  const existed = await Bun.file(TOKEN_PATH).exists();
  await rm(TOKEN_PATH, { force: true });
  return existed;
}
