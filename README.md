# BidChain

A tamper-evident property bidding platform for the Northern Ireland residential market.
Every material event in a sale's bidding journey is appended to a per-property SHA-256
hash chain, offers reach the vendor exactly as bidders author them, and any participant
(or any outside party) can verify the record's integrity without trusting the platform.

Built as the CSC7057 Individual Software Development Project, MSc Software Development,
Queen's University Belfast.

## Stack

Next.js (App Router) · TypeScript · PostgreSQL (raw `pg`) · Auth.js v5 · Tailwind CSS ·
Node `crypto` (SHA-256, Ed25519) · Vitest

## Getting started

Prerequisites: Node 20+, PostgreSQL, and Mailpit (or any SMTP sink on localhost:1025)
for outgoing email.

```bash
npm install

# database
createdb bidchain_dev
psql bidchain_dev -f ../schema_v5.sql

# environment
# create .env.local with:
#   DATABASE_URL=postgresql://<user>@localhost:5432/bidchain_dev
#   AUTH_SECRET=<random>
#   NEXT_PUBLIC_APP_URL=http://localhost:3000
#   SMTP_HOST=localhost
#   SMTP_PORT=1025
#   RECORD_SIGNING_KEY=<from generate-signing-key>
#   RECORD_SIGNING_PUBLIC_KEY=<from generate-signing-key>
node scripts/generate-signing-key.mjs

# demo environment: twelve properties covering every lifecycle state,
# verified at exit
npm run seed

npm run dev
```

Seeded accounts share one password and use the `bidchain.test` email domain
(agents `aoife@`, `conor@`; vendors `sean.vendor@`, `mary.vendor@`, `peter.vendor@`;
bidders `niamh@`, `dan@`, `claire@`, `siobhan@`, `conall@`, `emer@`, `ryan@`).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server at localhost:3000 |
| `npm run seed` | Rebuild and verify the twelve-property demo environment |
| `npm test` | Run the full test suite (122 tests) |
| `npm run test:coverage` | Suite plus the v8 coverage report |
| `npm run check` | TypeScript check |
| `npm run hash-check` | Re-verify every property's hash chain |

## Verifying records

Signed exports and receipts can be verified without trusting the platform:

- `node scripts/verify-record.mjs <file.json>` verifies a downloaded record or
  receipt against the public key inside it and prints the key fingerprint.
- The browser page at `/verify.html` does the same entirely client-side and
  compares the key against the platform's published fingerprint.
- `scripts/rewrite-demo.mjs` reproduces the receipt-versus-rewrite experiment
  from the dissertation's testing chapter.

A VALID result proves the bytes match the key inside the file; trust in that
key must be established with the platform directly, not taken from the file.

## Layout

- `lib/chain.ts` - canonicalisation, hashing, event grammar, chain verification
- `lib/events.ts` - the single append site for chain events
- `lib/signing.ts` / `lib/receipts.ts` - Ed25519 export and receipt signing
- `lib/actions/` - server actions (the only write paths)
- `app/` - pages and API routes
- `scripts/` - seed, verification and demo tooling
