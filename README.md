# QorePoll

**One address, one vote — proven by a hybrid signature.**

QorePoll is an on-chain poll and voting tool for QoreChain. A voter does not need a custom contract call: they send a tiny self-transfer with a structured memo, signed hybrid by QoreX. The indexer verifies the transaction, checks that it is actually hybrid-signed, and counts the first valid vote from each address.

> **Status:** early scaffold. The repository, licence, architecture, and scope are in place. The indexer, poll UI, and testnet proof are being built for the Build Before Q-Day deadline (2 December 2026, 23:59 UTC).

## The problem

Most “crypto polls” are either off-chain clicks or expensive contract calls. Off-chain polls cannot prove that a unique QoreChain address voted. Contract polls can, but they add deployment and gas overhead for a simple question.

QorePoll uses the chain itself as the ballot box:

- a vote is a native `0.000001 QOR` self-send;
- the memo carries the poll ID, option, and a nonce;
- QoreChain's hybrid signature proves the voter controlled the address;
- the indexer counts one vote per address, and the transaction is publicly auditable.

## Planned MVP

1. **Create a poll.** Question, 2–6 options, deadline, optional minimum balance, and one-vote-per-address.
2. **Vote from QoreX.** The UI generates the exact memo and amount; the voter sends it to their own address. No custom contract call.
3. **Index and verify.** The backend reads the transaction, checks the memo shape, confirms the hybrid signature, and records the first valid vote per address.
4. **Show live results.** Turnout, option totals, timeline, and a link to every vote transaction.
5. **Export.** JSON and CSV for organisers.
6. **Prove it on testnet.** One real poll with at least two hybrid-signed votes and explorer links.

## Why QoreChain

| Feature | Use |
|---|---|
| Hybrid ML-DSA-87 transactions | Every vote is a hybrid-signed self-send; the indexer rejects classical-only transactions |
| Native lane (`qor1`) | Votes are native transfers with memo data |
| QoreChain SDK | Parse transactions, convert addresses, read account state |
| QoreX | Voters sign in the wallet they already use |
| Optional EVM contract | A `PollRegistry` can anchor poll metadata and the final tally root |

## Architecture

```text
QoreX wallet
   │  0.000001 QOR self-send
   │  memo: qorepoll:<pollId>:<option>:<nonce>
   ▼
QoreChain Diana ──► indexer/verifier ──► SQLite ──► results dashboard
                         │
                         └── rejects bad memo, duplicate address,
                             expired poll, or non-hybrid signature
```

The first version uses an off-chain poll registry and an on-chain vote log. A small `PollRegistry` contract can anchor poll creation and the final tally without changing the voting flow.

## Memo format

```text
qorepoll:<pollId>:<optionIndex>:<nonce>
```

Example:

```text
qorepoll:7:2:9f3c1a
```

The nonce prevents two identical votes from looking the same; the poll ID and option index are validated against the database.

## Quickstart

> The app is not runnable yet. Setup instructions will be added as the scaffold lands.

```bash
git clone https://github.com/kceehackathon/qore-poll.git
cd qore-poll
cp .env.example .env
npm install
npm run dev
```

## Testnet addresses

| Purpose | Address |
|---|---|
| Poll creation / demo | _to be added_ |
| PollRegistry (optional) | _to be deployed_ |

## Demo video

_To be recorded before submission._

## Security and limitations

- Testnet only (`qorechain-diana`, EVM chain ID `9800`).
- One vote per address is only as strong as the cost of creating addresses. For high-stakes polls, add a minimum-balance or allowlist gate.
- The indexer must see the transaction before the poll deadline; late transactions are rejected.
- Memo voting is public. Do not put private information in a memo.
- The first version is not a private voting system.

## Licence

MIT. See [LICENSE](LICENSE).

## AI usage

See [AI_USAGE.md](AI_USAGE.md).

## Team

- Kcee Hackathon — [@kceehackathon](https://github.com/kceehackathon)
