import { createInterface } from "node:readline";
import type { TransactionStatus } from "./api";

// Colours only on a real terminal, and never when NO_COLOR is set.
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: number) => (text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);

export const c = {
  bold: paint(1),
  dim: paint(2),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  blue: paint(34),
  cyan: paint(36),
};

const visibleLength = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "").length;
const pad = (text: string, width: number) => text + " ".repeat(Math.max(0, width - visibleLength(text)));

export const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Plain-text table: a bold header row, then aligned columns.
export function table(headers: string[], rows: string[][]) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => visibleLength(r[i] ?? ""))));
  console.log(headers.map((h, i) => c.bold(pad(h, widths[i]!))).join("  "));
  for (const row of rows) console.log(row.map((cell, i) => pad(cell, widths[i]!)).join("  "));
}

// Key/value lines, labels aligned.
export function fields(entries: [string, string][]) {
  const width = Math.max(...entries.map(([label]) => label.length));
  for (const [label, value] of entries) console.log(`  ${c.dim(label.padEnd(width))}  ${value}`);
}

const kwanza = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });
export const money = (value: string | number) => kwanza.format(Number(value));

export const date = (iso: string) =>
  new Date(iso).toLocaleString("pt-AO", { timeZone: "Africa/Luanda", dateStyle: "short", timeStyle: "short" });

export const orDash = (value: string | null | undefined) => value || c.dim("—");

const STATUS_COLOR: Record<TransactionStatus, (text: string) => string> = {
  APPROVED: c.green,
  PENDING: c.yellow,
  FAILED: c.red,
  REVERSED: c.dim,
};
export const status = (value: TransactionStatus) => STATUS_COLOR[value](value);

export const METHODS = { GPO: "Multicaixa Express", REF: "Multicaixa reference" } as const;

export function fail(message: string): never {
  console.error(`${c.red("✖")} ${message}`);
  process.exit(1);
}

export const success = (message: string) => console.log(`${c.green("✔")} ${message}`);

// Reads one line. Unlike Bun's prompt() (null for both an empty answer and a
// closed stdin), an empty answer is "" here; only Ctrl+C / Ctrl+D exit.
function readLine(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    const quit = () => {
      process.stdout.write("\n");
      process.exit(130);
    };
    rl.on("SIGINT", quit);
    rl.on("close", () => {
      if (!answered) quit();
    });
    rl.question(`${question} `, (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });
  });
}

// Asks until the answer is valid. Empty answers return "" for optional questions.
export async function ask(
  question: string,
  { optional = false, validate }: { optional?: boolean; validate?: (value: string) => string | null } = {},
) {
  for (;;) {
    const value = (await readLine(`${c.cyan("?")} ${question}${optional ? c.dim(" (optional)") : ""}:`)).trim();
    if (!value && optional) return "";
    const problem = !value ? "This is required." : (validate?.(value) ?? null);
    if (!problem) return value;
    console.log(`  ${c.red(problem)}`);
  }
}

// Yes/no; an empty answer takes the default.
export async function confirm(question: string, { defaultYes = true } = {}) {
  const answer = (await readLine(`${c.cyan("?")} ${question} ${c.dim(defaultYes ? "(Y/n)" : "(y/N)")}`)).trim();
  return answer ? /^y/i.test(answer) : defaultYes;
}

// Reads a secret without echoing it (shows * per character).
export function askSecret(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return Promise.resolve((prompt(question) ?? "").trim());

  return new Promise((resolve) => {
    process.stdout.write(`${c.cyan("?")} ${question}: `);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    let value = "";

    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(value.trim());
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        value += ch;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}
