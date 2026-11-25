# AI usage

This project is built with AI assistance. This file records where AI was used, so judges and contributors can separate generated work from verified behaviour.

## Tools

| Tool | Role |
|---|---|
| OpenCode / DeepSeek V4.1 Flash | Repository scaffolding, memo format design, architecture notes, implementation drafts, test ideas, documentation review |
| Human maintainer | Product decisions, testnet voting transactions, wallet operations, final submission |

## Log

| Date (UTC) | Area | What the AI did | Human check |
|---|---|---|---|
| 2026-11-25 | Repository | Created the initial repository and README | Maintainer reviewed scope and licence |
| 2026-11-25 | Voting flow | Proposed the self-send memo format | Pending implementation and testnet proof |

## Rules

- AI-generated code is treated as a draft. It must be reviewed, tested, and run on Diana before it is described as working.
- No private keys, seed phrases, or wallet recovery phrases are given to an AI tool.
- On-chain evidence is linked in the README only after the transaction is confirmed.
- “Verified” claims must point to a transaction, a test, or a reproducible command.

## What is not AI-generated

- Votes and signatures are produced by the voter's QoreX wallet and the official QoreChain tooling.
- Testnet credentials stay with the maintainer.
