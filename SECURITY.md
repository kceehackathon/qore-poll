# Security policy

## Scope

QorePoll is a testnet-only voting prototype. It does not custody funds and it must never ask for a seed phrase, private key, or QoreX recovery phrase.

## Reporting a vulnerability

Open a private security advisory on GitHub, or contact the maintainer through the project page. Do not publish an exploitable issue before it has been acknowledged.

## Operational rules

- Keep `.env` out of git. Only `.env.example` is committed.
- Validate every memo field before writing a vote.
- Count only the first valid vote per address per poll.
- Reject votes after the poll deadline.
- Confirm the transaction is hybrid-signed; a classical-only transaction is not a valid vote.
- Do not put private information in a memo; memos are public.
- Rotate any credential that is accidentally committed or shared.

## Known limitations

- One address does not equal one person. For high-stakes polls, require a minimum balance or an allowlist.
- The indexer can miss a transaction during an outage; it must backfill by block range.
- The first version is not a private voting system.
