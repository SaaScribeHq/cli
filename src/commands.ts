import {
  type Customer,
  type Page,
  type PaymentField,
  type PaymentIntent,
  request,
  type Transaction,
  type TransactionDetail,
} from "./api";
import { withToken } from "./auth";
import { deleteToken, TOKEN_PATH } from "./config";
import {
  ask,
  c,
  confirm,
  date,
  fail,
  fields,
  METHODS,
  money,
  orDash,
  status,
  success,
  table,
  truncate,
} from "./ui";

type Flags = Record<string, string | true>;

const STATUSES = ["APPROVED", "PENDING", "FAILED", "REVERSED"];

// ?page=&pageSize=&q= (+ extras) from the command's flags.
function listQuery(flags: Flags, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  const page = flags.page ?? "1";
  const limit = flags.limit ?? "20";
  const search = flags.search ?? flags.q;
  params.set("page", String(page));
  params.set("pageSize", String(limit));
  if (typeof search === "string") params.set("q", search);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params;
}

function pageFooter(result: Page, count: number, command: string) {
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const footer = `${c.dim(`Page ${result.page} of ${pages} · ${result.total} total`)}`;
  const next = result.page < pages ? c.dim(` · next: ${command} --page ${result.page + 1}`) : "";
  console.log(`\n${footer}${next}`);
  if (count === 0) console.log(c.dim("Nothing to show."));
}

export async function listTransactions(flags: Flags) {
  const statusFlag = typeof flags.status === "string" ? flags.status.toUpperCase() : undefined;
  if (statusFlag && !STATUSES.includes(statusFlag)) fail(`--status must be one of ${STATUSES.join(", ")}`);

  const result = await withToken((token) =>
    request<{ transactions: Transaction[] } & Page>(
      token,
      "GET",
      `/transactions?${listQuery(flags, { status: statusFlag })}`,
    ),
  );

  table(
    ["ID", "Date", "Description", "Customer", "Method", "Status", "Amount", "Net"],
    result.transactions.map((t) => [
      c.dim(t.id),
      date(t.createdAt),
      truncate(t.description, 28),
      truncate(t.customer?.name ?? t.customer?.email ?? "—", 22),
      t.paymentMethod ? METHODS[t.paymentMethod] : "—",
      status(t.status),
      money(t.amount),
      money(t.netAmount),
    ]),
  );
  pageFooter(result, result.transactions.length, "scb transactions");
  if (result.transactions.length) console.log(c.dim("Details: scb transactions <id>"));
}

export async function showTransaction(id: string) {
  const { transaction: t } = await withToken((token) =>
    request<{ transaction: TransactionDetail }>(token, "GET", `/transactions/${encodeURIComponent(id)}`),
  );

  console.log(`\n${c.bold(money(t.amount))}  ${status(t.status)}  ${t.description}\n`);
  console.log(c.bold("Payment"));
  fields([
    ["ID", t.id],
    ["Method", t.paymentMethod ? METHODS[t.paymentMethod] : "—"],
    ...(t.details.phoneNumber ? ([["Phone", t.details.phoneNumber]] as [string, string][]) : []),
    ...(t.details.entity ? ([["Entity", t.details.entity]] as [string, string][]) : []),
    ...(t.details.reference ? ([["Reference", t.details.reference]] as [string, string][]) : []),
    ["Provider ref", orDash(t.details.providerReference)],
    ["Created", date(t.createdAt)],
    ["Updated", date(t.updatedAt)],
    ...(t.details.error ? ([["Error", c.red(t.details.error)]] as [string, string][]) : []),
  ]);
  console.log(`\n${c.bold("Amounts")}`);
  fields([
    ["Amount", money(t.amount)],
    ["Fee", money(t.fee)],
    ["Fixed fee", money(t.fixedFee)],
    ["Net", c.bold(money(t.netAmount))],
  ]);
  console.log(`\n${c.bold("Customer")}`);
  fields([
    ["Name", orDash(t.customer?.name)],
    ["Email", orDash(t.customer?.email)],
    ["Phone", orDash(t.customer?.phoneNumber)],
  ]);
  if (t.customFields.length > 0) {
    console.log(`\n${c.bold("Custom fields")}`);
    fields(t.customFields.map((f) => [f.label, orDash(f.value)]));
  }
  if (t.paymentIntent) {
    console.log(`\n${c.bold("Payment intent")}`);
    fields([
      ["ID", t.paymentIntent.id],
      ["Title", t.paymentIntent.title],
      ["Checkout", c.blue(t.paymentIntent.checkoutUrl)],
    ]);
  }
  console.log();
}

export async function listCustomers(flags: Flags) {
  const result = await withToken((token) =>
    request<{ customers: Customer[] } & Page>(token, "GET", `/customers?${listQuery(flags)}`),
  );

  table(
    ["Name", "Email", "Phone", "Payments", "Total spent", "Last payment"],
    result.customers.map((cu) => [
      truncate(cu.name ?? "Unnamed", 24),
      truncate(cu.email ?? "—", 28),
      cu.phoneNumber ?? "—",
      String(cu.transactionCount),
      money(cu.totalSpent),
      cu.lastTransactionAt ? date(cu.lastTransactionAt) : "—",
    ]),
  );
  pageFooter(result, result.customers.length, "scb customers");
}

const AMOUNT = /^\d+([.,]\d{1,2})?$/;
const isUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const METHOD_IDS = Object.keys(METHODS) as (keyof typeof METHODS)[];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;
const MAX_CUSTOM_FIELDS = 5;

// Which methods the checkout offers. Empty answer: all of them (null).
async function askPaymentMethods() {
  const options = METHOD_IDS.map((id) => `${id} (${METHODS[id]})`).join(", ");
  const answer = await ask(`Payment methods: ${options}, comma-separated. Enter for all`, {
    optional: true,
    validate: (v) => {
      const ids = v.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean);
      const unknown = ids.find((id) => !(METHOD_IDS as string[]).includes(id));
      return unknown ? `Unknown method ${unknown}. Use ${METHOD_IDS.join(" or ")}.` : null;
    },
  });
  if (!answer) return null;
  return [...new Set(answer.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean))] as (keyof typeof METHODS)[];
}

// Who pays, if known: an existing customer's ID, or an email (and name) to find or create one.
async function askCustomer(): Promise<
  { customerId: string } | { customer: { email: string; name?: string } } | null
> {
  const answer = await ask("Customer: their email, or an existing customer ID. Enter to ask on the checkout", {
    optional: true,
    validate: (v) => (v.includes("@") && !EMAIL.test(v) ? "Enter a valid email." : null),
  });
  if (!answer) return null;
  if (!answer.includes("@")) return { customerId: answer };
  const name = await ask("Customer's full name", {
    optional: true,
    validate: (v) => (v.length > 100 ? "Keep it under 100 characters." : null),
  });
  return { customer: { email: answer, name: name || undefined } };
}

// "Delivery note" -> "delivery_note": a valid field key from its label.
const keyFromLabel = (label: string) =>
  label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^[^A-Za-z]+|_+$/g, "")
    .slice(0, 50) || "field";

// Up to 5 extra checkout fields: inputs the customer fills in, or text shown to them.
async function askCustomFields() {
  const result: PaymentField[] = [];
  while (result.length < MAX_CUSTOM_FIELDS) {
    const question = result.length === 0 ? "Add a custom field to the checkout?" : "Add another custom field?";
    if (!(await confirm(question, { defaultYes: false }))) break;

    const label = await ask("  Label, shown to the customer", {
      validate: (v) => (v.length > 100 ? "Keep it under 100 characters." : null),
    });
    const suggested = keyFromLabel(label);
    const name =
      (await ask(`  Key for the answer ${c.dim(`(Enter for ${suggested})`)}`, {
        optional: true,
        validate: (v) =>
          !FIELD_KEY.test(v)
            ? "Use letters, digits and _, starting with a letter."
            : result.some((f) => f.name === v)
              ? "Another field already uses this key."
              : null,
      })) || suggested;
    if (result.some((f) => f.name === name)) {
      console.log(`  ${c.red(`Another field already uses the key ${name}. Try again with a different label or key.`)}`);
      continue;
    }

    const isText = !(await confirm("  Does the customer fill it in? (No: it's text shown to them)"));
    if (isText) {
      const value = await ask("  Text to show", {
        validate: (v) => (v.length > 500 ? "Keep it under 500 characters." : null),
      });
      result.push({ name, label, type: "textView", value });
    } else {
      const placeholder = await ask("  Placeholder", { optional: true });
      result.push({ name, label, type: "input", placeholder: placeholder || undefined });
    }
  }
  if (result.length === MAX_CUSTOM_FIELDS) console.log(c.dim(`  That's the maximum of ${MAX_CUSTOM_FIELDS} custom fields.`));
  return result;
}

// Interactive guide: asks for each field, shows a summary, then creates the intent.
export async function createIntent() {
  await withToken(async (token) => {
    console.log(`\n${c.bold("Create a payment intent")}`);
    console.log(c.dim("You'll get a checkout link to send to your customer.\n"));

    const amount = (await ask("Amount in Kz (e.g. 15000 or 15000,50)", {
      validate: (v) =>
        !AMOUNT.test(v.replace(/\s/g, ""))
          ? "Enter a number with up to 2 decimals."
          : Number(v.replace(/\s/g, "").replace(",", ".")) <= 0
            ? "Enter an amount greater than zero."
            : null,
    }))
      .replace(/\s/g, "")
      .replace(",", ".");
    const title = await ask("Title, shown to the customer", {
      validate: (v) => (v.length > 100 ? "Keep it under 100 characters." : null),
    });
    const description = await ask("Description", {
      optional: true,
      validate: (v) => (v.length > 500 ? "Keep it under 500 characters." : null),
    });
    const urlCheck = (v: string) => (isUrl(v) ? null : "Enter a full URL, starting with https://");
    const successUrl = await ask("Success URL, where the customer goes after paying", { optional: true, validate: urlCheck });
    const cancelUrl = await ask("Cancel URL, where the customer goes if they cancel", { optional: true, validate: urlCheck });
    const paymentMethods = await askPaymentMethods();
    const customer = await askCustomer();
    const customFields = await askCustomFields();

    console.log(`\n${c.bold("Summary")}`);
    fields([
      ["Amount", money(amount)],
      ["Title", title],
      ["Description", orDash(description)],
      ["Success URL", successUrl || c.dim("your account's website")],
      ["Cancel URL", cancelUrl || c.dim("your account's website")],
      ["Methods", paymentMethods ? paymentMethods.map((m) => METHODS[m]).join(", ") : c.dim("all")],
      [
        "Customer",
        !customer
          ? c.dim("asked on the checkout")
          : "customerId" in customer
            ? customer.customerId
            : [customer.customer.name, customer.customer.email].filter(Boolean).join(" · "),
      ],
      ["Custom fields", customFields.length ? customFields.map((f) => f.label).join(", ") : c.dim("none")],
    ]);
    console.log();
    if (!(await confirm("Create this payment intent?"))) {
      console.log(c.dim("Cancelled."));
      return;
    }

    const { paymentIntent, checkoutUrl } = await request<{ paymentIntent: PaymentIntent; checkoutUrl: string }>(
      token,
      "POST",
      "/payment-intents",
      {
        amount,
        title,
        description: description || undefined,
        successUrl: successUrl || undefined,
        cancelUrl: cancelUrl || undefined,
        paymentMethods,
        ...customer,
        customFields: customFields.length ? customFields : undefined,
      },
    );

    console.log();
    success("Payment intent created");
    fields([
      ["ID", paymentIntent.id],
      ["Amount", money(paymentIntent.amount)],
      ...(paymentIntent.customer ? ([["Customer ID", paymentIntent.customer.id]] as [string, string][]) : []),
      ["Checkout", c.blue(checkoutUrl)],
    ]);
    console.log(c.dim("\nSend the checkout link to your customer. Track it with: scb transactions"));
  });
}

export async function logout() {
  const existed = await deleteToken();
  success(existed ? `Logged out. Removed ${TOKEN_PATH}` : "You weren't logged in.");
}

export function help() {
  console.log(`${c.bold("scb")} — the Saascribe CLI

${c.bold("Usage")}
  scb <command> [options]

${c.bold("Commands")}
  auth                     Connect with a secret API key (replaces a saved one)
  transactions             List transactions
    --status <status>      APPROVED, PENDING, FAILED or REVERSED
    --search <text>        Search description or customer
    --page <n>             Page to show (default 1)
    --limit <n>            Items per page, up to 100 (default 20)
  transactions <id>        Show a transaction's details
  customers                List customers
    --search <text>        Search name, email or phone
    --page <n>, --limit <n>
  create intent            Create a payment intent, step by step
  logout                   Remove the saved API key
  help                     Show this help

${c.bold("Authentication")}
  Run scb auth and paste a secret API key (Dashboard → Settings → Developers).
  It's saved to ${TOKEN_PATH}.

${c.bold("Environment")}
  SAASCRIBE_API_URL        API to talk to (default http://localhost:3001)
  NO_COLOR                 Disable colours`);
}
