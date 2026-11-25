import { randomBytes } from "node:crypto";
import path from "node:path";
import express from "express";

import { env } from "./env.js";
import {
  countPolls,
  countVotes,
  createPoll,
  getPoll,
  listPolls,
  listRecentVotes,
  listVotes,
} from "./db.js";
import { explorerAddressUrl, explorerTxUrl, shortAddress } from "./qore.js";
import { VoteError, verifyVoteTx } from "./verify.js";

const app = express();
app.use(express.json({ limit: "64kb" }));

function qorToUqor(value: string): string | null {
  const cleaned = value.trim();
  if (!cleaned) return "0";
  if (!/^\d+(\.\d{1,6})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return `${BigInt(whole!)}${fraction.padEnd(6, "0")}`.replace(/^0+(?=\d)/, "");
}

function publicPoll(slug: string) {
  const poll = getPoll(slug);
  if (!poll) return undefined;
  return {
    ...poll,
    sharePath: `/poll/${poll.slug}`,
    recentVotes: listVotes(poll.id, 25).map((vote) => ({
      ...vote,
      voterShort: shortAddress(vote.voter),
      txUrl: explorerTxUrl(vote.txHash),
      voterUrl: explorerAddressUrl(vote.voter),
    })),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    network: env.network,
    chainId: env.chainId,
    restUrl: env.restUrl,
    polls: countPolls(),
    votes: countVotes(),
    now: new Date().toISOString(),
  });
});

app.get("/api/polls", (_req, res) => {
  res.json(
    listPolls().map((poll) => ({
      ...poll,
      sharePath: `/poll/${poll.slug}`,
    })),
  );
});

app.get("/api/votes/recent", (_req, res) => {
  res.json(
    listRecentVotes(20).map((vote) => ({
      ...vote,
      voterShort: shortAddress(vote.voter),
      txUrl: explorerTxUrl(vote.txHash),
    })),
  );
});

app.post("/api/polls", (req, res) => {
  const body = req.body as {
    question?: string;
    description?: string;
    options?: unknown;
    deadline?: string;
    minBalance?: string;
  };
  const question = String(body.question ?? "").trim();
  if (question.length < 8 || question.length > 180) {
    res.status(400).json({ error: "Question must be 8–180 characters." });
    return;
  }
  const options = Array.isArray(body.options)
    ? body.options.map((option) => String(option ?? "").trim()).filter(Boolean)
    : [];
  if (options.length < 2 || options.length > 6) {
    res.status(400).json({ error: "Use between 2 and 6 options." });
    return;
  }
  if (options.some((option) => option.length > 90)) {
    res.status(400).json({ error: "Each option must be at most 90 characters." });
    return;
  }
  const uniqueOptions = new Set(options.map((option) => option.toLowerCase()));
  if (uniqueOptions.size !== options.length) {
    res.status(400).json({ error: "Options must be distinct." });
    return;
  }
  const deadline = new Date(String(body.deadline ?? ""));
  if (!Number.isFinite(deadline.getTime())) {
    res.status(400).json({ error: "Choose a valid deadline." });
    return;
  }
  const now = Date.now();
  if (deadline.getTime() <= now + 60_000) {
    res.status(400).json({ error: "The deadline must be at least one minute away." });
    return;
  }
  if (deadline.getTime() > now + 180 * 24 * 60 * 60 * 1000) {
    res.status(400).json({ error: "The deadline must be within 180 days." });
    return;
  }
  const minBalanceUqor = qorToUqor(String(body.minBalance ?? "0"));
  if (minBalanceUqor === null) {
    res.status(400).json({ error: "Minimum balance must be a QOR amount with up to 6 decimals." });
    return;
  }
  const poll = createPoll({
    slug: randomBytes(5).toString("hex"),
    question,
    description: String(body.description ?? "").trim().slice(0, 600),
    options,
    deadline: deadline.toISOString(),
    minBalanceUqor,
  });
  res.status(201).json(publicPoll(poll.slug));
});

app.get("/api/polls/:slug", (req, res) => {
  const poll = publicPoll(req.params.slug);
  if (!poll) {
    res.status(404).json({ error: "Poll not found." });
    return;
  }
  res.json(poll);
});

app.post("/api/polls/:slug/verify", async (req, res) => {
  const body = req.body as { txHash?: string };
  try {
    const result = await verifyVoteTx(String(body.txHash ?? ""));
    if (result.poll.slug !== req.params.slug) {
      res.status(409).json({
        error: `That transaction is a vote in poll ${result.poll.slug}, not this one.`,
      });
      return;
    }
    res.json({
      verified: true,
      vote: {
        ...result.vote,
        voterShort: shortAddress(result.vote.voter),
        txUrl: explorerTxUrl(result.vote.txHash),
      },
      poll: publicPoll(req.params.slug),
    });
  } catch (error) {
    if (error instanceof VoteError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("vote verification failed:", error);
    res.status(500).json({ error: "Verification failed unexpectedly." });
  }
});

app.get("/api/polls/:slug/export.json", (req, res) => {
  const poll = publicPoll(req.params.slug);
  if (!poll) {
    res.status(404).json({ error: "Poll not found." });
    return;
  }
  res.setHeader("content-disposition", `attachment; filename="qorepoll-${poll.slug}.json"`);
  res.json({ exportedAt: new Date().toISOString(), poll, votes: listVotes(poll.id, 200) });
});

app.get("/api/polls/:slug/export.csv", (req, res) => {
  const poll = publicPoll(req.params.slug);
  if (!poll) {
    res.status(404).json({ error: "Poll not found." });
    return;
  }
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = [
    ["voter", "option_index", "option_label", "tx_hash", "height", "voted_at"].join(","),
    ...listVotes(poll.id, 200).map((vote) =>
      [
        escape(vote.voter),
        vote.optionIndex,
        escape(vote.optionLabel),
        vote.txHash,
        vote.height,
        vote.votedAt,
      ].join(","),
    ),
  ];
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="qorepoll-${poll.slug}.csv"`);
  res.send(rows.join("\n"));
});

const dist = path.resolve(process.cwd(), "dist");
app.use(express.static(dist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(dist, "index.html"), (error) => {
    if (error) next();
  });
});

app.listen(env.port, () => {
  console.log(`QorePoll API on http://localhost:${env.port} (${env.network})`);
});
