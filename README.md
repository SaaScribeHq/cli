# scb — the Saascribe CLI

Talks to the Saascribe developer API (`/v1`) with your account's secret API key.

## Install

Requires [Bun](https://bun.sh).

```bash
npm install -g SaaScribeHq/cli   # from github.com/SaaScribeHq/cli
```

From a local checkout:

```bash
bun install
bun link          # makes `scb` available on your PATH
```

Or build a standalone binary:

```bash
bun run build     # -> dist/scb
```

Without installing: `bun index.ts <command>`.

## Authentication

Run `scb auth` and paste a secret API key (Dashboard → Settings → Developers).
It's checked against the API and saved to `~/.saascribe/token` (readable only by you).
`scb auth` again replaces it; `scb logout` removes it.

## Commands

```bash
scb auth                             # connect with your API key
scb transactions                     # list transactions
scb transactions --status PENDING    # filter: APPROVED, PENDING, FAILED, REVERSED
scb transactions --search "order"    # search description or customer
scb transactions <id>                # transaction details
scb customers                        # list customers (--search, --page, --limit)
scb create intent                    # step-by-step: amount, methods, customer, custom fields -> checkout link
scb logout                           # remove the saved API key
scb help
```

## Environment

| Variable | Default | |
| --- | --- | --- |
| `SAASCRIBE_API_URL` | `http://localhost:3001` | API to talk to |
| `NO_COLOR` | | Disable colours |
