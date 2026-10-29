import { ApiError, request } from "./api";
import { readToken, saveToken, TOKEN_PATH } from "./config";
import { askSecret, c, fail, success } from "./ui";

const KEY_FORMAT = /^sk_(test|live)_\S+$/;

// Asks for a secret API key, checks it against the API, and saves it.
export async function login() {
  console.log(`${c.bold("Connect the Saascribe CLI")}`);
  console.log(c.dim("Create a secret API key in the dashboard under Settings → Developers.\n"));

  for (let attempt = 0; attempt < 3; attempt++) {
    const key = await askSecret("API key (sk_test_… or sk_live_…)");
    if (!KEY_FORMAT.test(key)) {
      console.log(`  ${c.red("That doesn't look like a secret API key.")}`);
      continue;
    }
    try {
      await request(key, "GET", "/customers?pageSize=1");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        console.log(`  ${c.red(err.message)}`);
        continue;
      }
      throw err;
    }
    await saveToken(key);
    success(`Connected ${key.startsWith("sk_live_") ? "(live mode)" : "(test mode)"}. Key saved to ${TOKEN_PATH}\n`);
    return key;
  }
  fail("Couldn't connect. Check your API key and try again.");
}

// Runs a command with the saved key. Authenticating is explicit: `scb auth`.
export async function withToken<T>(run: (token: string) => Promise<T>): Promise<T> {
  const token = await readToken();
  if (!token) fail(`Not logged in. Run: ${c.bold("scb auth")}`);
  try {
    return await run(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      fail(`Your saved API key no longer works (${err.message}). Run: ${c.bold("scb auth")}`);
    }
    throw err;
  }
}
