# Architecture

## Goal

Turn a QoreChain hybrid-signed self-send into a verifiable vote, without requiring a custom contract call from the voter.

## Components

### Poll service

- Creates polls: question, options, deadline, optional minimum balance or allowlist.
- Stores poll metadata and vote records in SQLite.
- Exposes a public results endpoint.

### Vote indexer

- Scans native transactions for the poll address / memo prefix.
- Validates:
  - memo shape `qorepoll:<pollId>:<option>:<nonce>`;
  - amount is exactly `0.000001 QOR`;
  - recipient is the poll's designated address;
  - transaction is hybrid-signed (secp256k1 + ML-DSA-87);
  - poll exists, is open, and the option index is valid;
  - the sender has not already voted in this poll.
- Writes the first valid vote per `(pollId, voter)`.

### Web app

- React + Vite.
- Creates a poll and shows the exact vote instructions.
- Generates the memo and a QR/deep link for QoreX.
- Shows live results and links to each vote transaction.

### Optional PollRegistry

- Anchors poll metadata and the final tally root on Diana.
- Does not replace the memo-based vote log in the MVP.

## Data model

```sql
polls(id, question, options_json, deadline, min_balance, created_at, closed_at, tally_root)
votes(id, poll_id, voter, option_index, memo, tx_hash, block_height, created_at)
```

## Trust boundaries

- The chain is the source of truth for whether a vote transaction exists.
- The indexer is trusted to parse it correctly; tests must cover malformed memos and duplicate votes.
- The poll creator is trusted to define the question and options.
- The UI never signs for the voter; QoreX does.

## Failure modes

- Indexer offline: backfill from the last processed height before closing a poll.
- Duplicate memo: reject the second vote from the same address.
- Late vote: reject if the transaction block time is after the deadline.
- Reorg: re-scan the confirmation window before finalising results.
