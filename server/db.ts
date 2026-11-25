import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { env } from "./env.js";

fs.mkdirSync(path.dirname(env.databaseUrl), { recursive: true });

export const db = new Database(env.databaseUrl);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    question TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    deadline TEXT NOT NULL,
    min_balance_uqor TEXT NOT NULL DEFAULT '0',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS options (
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (poll_id, idx)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_idx INTEGER NOT NULL,
    voter TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    height INTEGER NOT NULL,
    voted_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (poll_id, voter)
  );

  CREATE INDEX IF NOT EXISTS votes_poll ON votes(poll_id, id DESC);
`);

export interface PollOption {
  index: number;
  label: string;
  votes: number;
}

export interface Poll {
  id: number;
  slug: string;
  question: string;
  description: string;
  deadline: string;
  minBalanceUqor: string;
  createdAt: string;
  status: "open" | "closed";
  options: PollOption[];
  totalVotes: number;
  turnout: number;
}

export interface Vote {
  id: number;
  pollSlug: string;
  pollQuestion: string;
  optionIndex: number;
  optionLabel: string;
  voter: string;
  txHash: string;
  height: number;
  votedAt: string;
  createdAt: string;
}

interface PollRow {
  id: number;
  slug: string;
  question: string;
  description: string;
  deadline: string;
  min_balance_uqor: string;
  created_at: string;
}

interface OptionRow {
  idx: number;
  label: string;
  votes: number;
}

interface VoteRow {
  id: number;
  poll_slug: string;
  poll_question: string;
  option_idx: number;
  option_label: string;
  voter: string;
  tx_hash: string;
  height: number;
  voted_at: string;
  created_at: string;
}

function mapPoll(row: PollRow, options: OptionRow[]): Poll {
  const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);
  return {
    id: row.id,
    slug: row.slug,
    question: row.question,
    description: row.description,
    deadline: row.deadline,
    minBalanceUqor: row.min_balance_uqor,
    createdAt: row.created_at,
    status: Date.now() > new Date(row.deadline).getTime() ? "closed" : "open",
    options: options.map((option) => ({
      index: option.idx,
      label: option.label,
      votes: option.votes,
    })),
    totalVotes,
    turnout: totalVotes,
  };
}

function optionsFor(pollId: number): OptionRow[] {
  return db
    .prepare(
      `SELECT o.idx, o.label, COUNT(v.id) AS votes
       FROM options o
       LEFT JOIN votes v ON v.poll_id = o.poll_id AND v.option_idx = o.idx
       WHERE o.poll_id = ?
       GROUP BY o.idx, o.label
       ORDER BY o.idx ASC`,
    )
    .all(pollId) as OptionRow[];
}

export function createPoll(input: {
  slug: string;
  question: string;
  description: string;
  options: string[];
  deadline: string;
  minBalanceUqor: string;
}): Poll {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO polls (slug, question, description, deadline, min_balance_uqor, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.slug,
      input.question,
      input.description,
      input.deadline,
      input.minBalanceUqor,
      now,
    );
  const pollId = Number(result.lastInsertRowid);
  const insertOption = db.prepare("INSERT INTO options (poll_id, idx, label) VALUES (?, ?, ?)");
  input.options.forEach((label, index) => insertOption.run(pollId, index, label));
  return getPoll(input.slug)!;
}

export function getPoll(slug: string): Poll | undefined {
  const row = db.prepare("SELECT * FROM polls WHERE slug = ?").get(slug) as PollRow | undefined;
  if (!row) return undefined;
  return mapPoll(row, optionsFor(row.id));
}

export function listPolls(): Poll[] {
  const rows = db.prepare("SELECT * FROM polls ORDER BY created_at DESC").all() as PollRow[];
  return rows.map((row) => mapPoll(row, optionsFor(row.id)));
}

export function getVoteByTx(txHash: string): Vote | undefined {
  const row = db
    .prepare(
      `SELECT v.id, p.slug AS poll_slug, p.question AS poll_question,
              v.option_idx, o.label AS option_label, v.voter, v.tx_hash,
              v.height, v.voted_at, v.created_at
       FROM votes v
       JOIN polls p ON p.id = v.poll_id
       JOIN options o ON o.poll_id = v.poll_id AND o.idx = v.option_idx
       WHERE v.tx_hash = ?`,
    )
    .get(txHash) as VoteRow | undefined;
  return row ? mapVote(row) : undefined;
}

export function hasVoted(pollId: number, voter: string): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM votes WHERE poll_id = ? AND voter = ?")
    .get(pollId, voter) as { found: number } | undefined;
  return Boolean(row);
}

export function insertVote(input: {
  pollId: number;
  optionIndex: number;
  voter: string;
  txHash: string;
  height: number;
  votedAt: string;
}): Vote | undefined {
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO votes (poll_id, option_idx, voter, tx_hash, height, voted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.pollId,
      input.optionIndex,
      input.voter,
      input.txHash,
      input.height,
      input.votedAt,
      now,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) return undefined;
    throw error;
  }
  return getVoteByTx(input.txHash);
}

function mapVote(row: VoteRow): Vote {
  return {
    id: row.id,
    pollSlug: row.poll_slug,
    pollQuestion: row.poll_question,
    optionIndex: row.option_idx,
    optionLabel: row.option_label,
    voter: row.voter,
    txHash: row.tx_hash,
    height: row.height,
    votedAt: row.voted_at,
    createdAt: row.created_at,
  };
}

export function listVotes(pollId: number, limit = 50): Vote[] {
  const rows = db
    .prepare(
      `SELECT v.id, p.slug AS poll_slug, p.question AS poll_question,
              v.option_idx, o.label AS option_label, v.voter, v.tx_hash,
              v.height, v.voted_at, v.created_at
       FROM votes v
       JOIN polls p ON p.id = v.poll_id
       JOIN options o ON o.poll_id = v.poll_id AND o.idx = v.option_idx
       WHERE v.poll_id = ?
       ORDER BY v.voted_at DESC, v.id DESC
       LIMIT ?`,
    )
    .all(pollId, Math.min(Math.max(limit, 1), 200)) as VoteRow[];
  return rows.map(mapVote);
}

export function listRecentVotes(limit = 12): Vote[] {
  const rows = db
    .prepare(
      `SELECT v.id, p.slug AS poll_slug, p.question AS poll_question,
              v.option_idx, o.label AS option_label, v.voter, v.tx_hash,
              v.height, v.voted_at, v.created_at
       FROM votes v
       JOIN polls p ON p.id = v.poll_id
       JOIN options o ON o.poll_id = v.poll_id AND o.idx = v.option_idx
       ORDER BY v.voted_at DESC, v.id DESC
       LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 100)) as VoteRow[];
  return rows.map(mapVote);
}

export function countPolls(): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM polls").get() as { n: number };
  return row.n;
}

export function countVotes(): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM votes").get() as { n: number };
  return row.n;
}
