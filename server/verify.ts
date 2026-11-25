import {
  getPoll,
  getVoteByTx,
  hasVoted,
  insertVote,
  type Poll,
  type Vote,
} from "./db.js";
import { getDecodedTx, getUqorBalance, messageType, type DecodedTx } from "./qore.js";

export class VoteError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "VoteError";
  }
}

export interface ParsedMemo {
  slug: string;
  optionIndex: number;
  nonce: string;
}

export function parseVoteMemo(memo: string): ParsedMemo | null {
  const match = memo.trim().match(/^qorepoll:([a-z0-9]{4,16}):(\d{1,2}):([a-z0-9]{4,32})$/);
  if (!match) return null;
  return {
    slug: match[1]!,
    optionIndex: Number(match[2]),
    nonce: match[3]!,
  };
}

export async function verifyVoteTx(rawHash: string): Promise<{
  poll: Poll;
  vote: Vote;
  tx: DecodedTx;
}> {
  const hash = rawHash.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hash)) {
    throw new VoteError("Enter a 64-character transaction hash.");
  }

  const existing = getVoteByTx(hash);
  if (existing) {
    const poll = getPoll(existing.pollSlug);
    if (!poll) throw new VoteError("The poll for this vote no longer exists.", 404);
    return { poll, vote: existing, tx: await mustDecoded(hash) };
  }

  const tx = await mustDecoded(hash);
  if (tx.code !== 0) throw new VoteError(`Transaction failed with code ${tx.code}.`);
  if (!tx.isHybrid) {
    throw new VoteError("This transaction is not hybrid-signed. QorePoll only counts ML-DSA-87 + secp256k1 votes.");
  }

  const parsed = parseVoteMemo(tx.memo);
  if (!parsed) {
    throw new VoteError("Memo must look like qorepoll:<pollId>:<option>:<nonce>.");
  }

  const poll = getPoll(parsed.slug);
  if (!poll) throw new VoteError("That poll does not exist.", 404);
  if (parsed.optionIndex < 0 || parsed.optionIndex >= poll.options.length) {
    throw new VoteError("That option is not on this ballot.");
  }

  const deadline = new Date(poll.deadline).getTime();
  const txTime = new Date(tx.timestamp).getTime();
  if (Number.isFinite(txTime) && txTime > deadline) {
    throw new VoteError("This vote was included after the poll deadline.");
  }
  if (!Number.isFinite(txTime) && Date.now() > deadline) {
    throw new VoteError("This poll is closed.");
  }

  if (tx.messages.length !== 1) {
    throw new VoteError("A vote must be a single-message transaction.");
  }
  const message = tx.messages[0]!;
  if (!messageType(message).endsWith("MsgSend")) {
    throw new VoteError("A vote must be a native bank send.");
  }
  const from = String(message.from_address ?? "");
  const to = String(message.to_address ?? "");
  if (!from || from !== to) {
    throw new VoteError("A vote must be a self-send: from and to must be the same address.");
  }
  const amount = Array.isArray(message.amount) ? message.amount : [];
  const tinySelfSend = amount.some((coin) => {
    const entry = coin as { denom?: string; amount?: string };
    return entry.denom === "uqor" && String(entry.amount) === "1";
  });
  if (amount.length !== 1 || !tinySelfSend) {
    throw new VoteError("A vote must send exactly 0.000001 QOR (1 uqor) to yourself.");
  }

  if (hasVoted(poll.id, from)) {
    throw new VoteError("This address has already voted in this poll.", 409);
  }

  const minimum = BigInt(poll.minBalanceUqor || "0");
  if (minimum > 0n) {
    let balance: bigint;
    try {
      balance = await getUqorBalance(from);
    } catch {
      throw new VoteError("Could not check the voter balance. Try again in a moment.", 503);
    }
    if (balance < minimum) {
      throw new VoteError("This poll requires a higher QOR balance to vote.", 403);
    }
  }

  const vote = insertVote({
    pollId: poll.id,
    optionIndex: parsed.optionIndex,
    voter: from,
    txHash: tx.hash,
    height: tx.height,
    votedAt: tx.timestamp,
  });
  if (!vote) {
    throw new VoteError("This vote or address has already been counted.", 409);
  }
  return { poll: getPoll(poll.slug)!, vote, tx };
}

async function mustDecoded(hash: string): Promise<DecodedTx> {
  let tx: DecodedTx | null = null;
  try {
    tx = await getDecodedTx(hash);
  } catch {
    throw new VoteError("QoreChain REST is temporarily unavailable. Try again.", 503);
  }
  if (!tx) throw new VoteError("Transaction not found on the Diana testnet.", 404);
  return tx;
}
