#!/usr/bin/env bun
import { ApiError } from "./src/api";
import { login } from "./src/auth";
import { createIntent, help, listCustomers, listTransactions, logout, showTransaction } from "./src/commands";
import { c, fail } from "./src/ui";

// argv -> positional words + --flags (--key value, --key=value, or a bare --flag).
function parseArgs(argv: string[]) {
  const words: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split("=", 2) as [string, string | undefined];
    if (inline !== undefined) flags[key] = inline;
    else if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) flags[key] = argv[++i]!;
    else flags[key] = true;
  }
  return { words, flags };
}

async function main() {
  const { words, flags } = parseArgs(Bun.argv.slice(2));
  const [command, arg] = words;

  switch (command) {
    case "transactions":
    case "transaction":
      return arg ? showTransaction(arg) : listTransactions(flags);
    case "customers":
      return listCustomers(flags);
    case "create":
      if (arg === "intent") return createIntent();
      return fail(`Unknown thing to create: ${arg ?? "(none)"}. Try: scb create intent`);
    case "auth":
    case "login":
      return login();
    case "logout":
      return logout();
    case undefined:
    case "help":
    case "--help":
      return help();
    default:
      console.error(`${c.red("✖")} Unknown command: ${command}\n`);
      help();
      process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof ApiError) {
    const issues = Object.entries(err.issues ?? {}).map(([field, messages]) => `\n  ${field}: ${messages.join(", ")}`);
    fail(`${err.message}${issues.join("")}`);
  }
  throw err;
});
