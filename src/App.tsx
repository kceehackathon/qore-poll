import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";

const EXPLORER = "https://explore.qore.network";

interface Option {
  index: number;
  label: string;
  votes: number;
}

interface Vote {
  id: number;
  pollSlug: string;
  pollQuestion: string;
  optionIndex: number;
  optionLabel: string;
  voter: string;
  voterShort?: string;
  txHash: string;
  txUrl?: string;
  height: number;
  votedAt: string;
  createdAt: string;
}

interface Poll {
  id: number;
  slug: string;
  question: string;
  description: string;
  deadline: string;
  minBalanceUqor: string;
  createdAt: string;
  status: "open" | "closed";
  options: Option[];
  totalVotes: number;
  turnout: number;
  sharePath: string;
  recentVotes?: Vote[];
}

interface Health {
  ok: boolean;
  network: string;
  polls: number;
  votes: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: HTTP ${response.status}`);
  return payload as T;
}

function randomNonce(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function short(value: string, front = 7, back = 5): string {
  if (value.length <= front + back + 1) return value;
  return `${value.slice(0, front)}…${value.slice(-back)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function deadlineInput(days = 7): string {
  const date = new Date(Date.now() + days * 86_400_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function countdown(iso: string): string {
  const delta = new Date(iso).getTime() - Date.now();
  if (delta <= 0) return "closed";
  const days = Math.floor(delta / 86_400_000);
  const hours = Math.floor((delta % 86_400_000) / 3_600_000);
  const minutes = Math.floor((delta % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function topOption(poll: Poll): Option | undefined {
  return [...poll.options].sort((a, b) => b.votes - a.votes)[0];
}

function TopBar() {
  return (
    <header className="topbar">
      <Link className="brand" to="/">
        <span className="seal">QP</span>
        <span>
          Qore<span className="brand-accent">Poll</span>
        </span>
      </Link>
      <nav>
        <a href="/#create">Create</a>
        <a href="/#polls">Polls</a>
        <a href="/#how">How it works</a>
      </nav>
      <a className="chain-pill" href={`${EXPLORER}/?network=testnet`} target="_blank" rel="noreferrer">
        <span className="live-dot" /> Diana testnet
      </a>
    </header>
  );
}

function Footer() {
  return (
    <footer>
      <span>QorePoll · one address, one hybrid-signed vote</span>
      <span>
        Built for <a href="https://build.qorechain.io">Build Before Q-Day</a>
      </span>
    </footer>
  );
}

function PollCard({ poll }: { poll: Poll }) {
  const leader = topOption(poll);
  return (
    <Link className="poll-card" to={`/poll/${poll.slug}`}>
      <div className="poll-card-top">
        <span className={`status ${poll.status}`}>{poll.status}</span>
        <span className="poll-code">#{poll.slug}</span>
      </div>
      <h3>{poll.question}</h3>
      <p className="poll-meta">
        {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"} · {countdown(poll.deadline)}
      </p>
      {leader && poll.totalVotes > 0 && (
        <p className="leader">
          Leading: <strong>{leader.label}</strong>
        </p>
      )}
      <span className="card-link">Open ballot →</span>
    </Link>
  );
}

function CreatePoll({ onCreated }: { onCreated: (poll: Poll) => void }) {
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [deadline, setDeadline] = useState(deadlineInput());
  const [minBalance, setMinBalance] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateOption(index: number, value: string) {
    setOptions((current) => current.map((option, at) => (at === index ? value : option)));
  }

  function addOption() {
    if (options.length < 6) setOptions((current) => [...current, ""]);
  }

  function removeOption(index: number) {
    if (options.length > 2) setOptions((current) => current.filter((_, at) => at !== index));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const poll = await api<Poll>("/api/polls", {
        method: "POST",
        body: JSON.stringify({
          question,
          description,
          options,
          deadline: new Date(deadline).toISOString(),
          minBalance,
        }),
      });
      onCreated(poll);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="create-form" onSubmit={submit}>
      <label>
        The question
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Which QoreChain builder demo should ship next?"
          maxLength={180}
        />
      </label>
      <label>
        Context <span className="optional">optional</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A sentence or two for voters."
          maxLength={600}
          rows={2}
        />
      </label>
      <div className="options-editor">
        <span className="field-label">Options</span>
        {options.map((option, index) => (
          <div className="option-row" key={index}>
            <span className="option-number">{index + 1}</span>
            <input
              value={option}
              onChange={(event) => updateOption(index, event.target.value)}
              placeholder={index === 0 ? "First option" : index === 1 ? "Second option" : "Another option"}
              maxLength={90}
            />
            {options.length > 2 && (
              <button type="button" className="remove" onClick={() => removeOption(index)}>
                ×
              </button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button type="button" className="text-button" onClick={addOption}>
            + Add option
          </button>
        )}
      </div>
      <div className="create-row">
        <label>
          Deadline
          <input
            type="datetime-local"
            value={deadline}
            min={deadlineInput(0)}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </label>
        <label>
          Minimum QOR balance <span className="optional">optional</span>
          <input
            value={minBalance}
            onChange={(event) => setMinBalance(event.target.value)}
            placeholder="0"
            inputMode="decimal"
          />
        </label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <button className="button primary" disabled={busy}>
        {busy ? "Publishing…" : "Publish poll"}
      </button>
      <p className="fine-print">
        Creating a poll is free and off-chain. Voters anchor their own votes with a hybrid-signed
        QoreChain transaction.
      </p>
    </form>
  );
}

function Home() {
  const navigate = useNavigate();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [recent, setRecent] = useState<Vote[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [nextPolls, nextRecent, nextHealth] = await Promise.all([
        api<Poll[]>("/api/polls"),
        api<Vote[]>("/api/votes/recent"),
        api<Health>("/api/health"),
      ]);
      setPolls(nextPolls);
      setRecent(nextRecent);
      setHealth(nextHealth);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <TopBar />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="kicker">QoreChain · memo ballots</span>
            <h1>
              Ask the chain.
              <br />
              <em>Count the signatures.</em>
            </h1>
            <p>
              QorePoll turns a tiny hybrid-signed self-send into a ballot. No contract deployment,
              no gas auction, no off-chain click. The memo carries the vote; the chain proves who
              sent it.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#create">
                Create a poll
              </a>
              <a className="button quiet" href="#how">
                How the ballot works
              </a>
            </div>
            <div className="stats">
              <span>
                <strong>{health?.polls ?? polls.length}</strong> polls
              </span>
              <span>
                <strong>{health?.votes ?? recent.length}</strong> verified votes
              </span>
              <span>
                <span className="live-dot" /> {health?.network ?? "qorechain-diana"}
              </span>
            </div>
          </div>
          <aside className="ballot-art" aria-hidden="true">
            <div className="ballot-paper">
              <div className="ballot-head">QOREPOLL / BALLOT</div>
              <div className="ballot-line" />
              <div className="ballot-question">Should the community fund the next public-good round?</div>
              <div className="ballot-choice">
                <span className="box checked">✓</span> Yes, ship it
              </div>
              <div className="ballot-choice">
                <span className="box" /> Not yet
              </div>
              <div className="ballot-choice">
                <span className="box" /> Abstain
              </div>
              <div className="ballot-foot">memo 0.000001 QOR · ML-DSA-87</div>
            </div>
            <div className="stamp">HYBRID<br />VERIFIED</div>
          </aside>
        </section>

        <section className="how" id="how">
          <div className="section-label">The mechanism</div>
          <div className="how-grid">
            <article>
              <span className="step">01</span>
              <h3>Write the memo</h3>
              <p>
                The app generates <code>qorepoll:&lt;id&gt;:&lt;option&gt;:&lt;nonce&gt;</code>.
                The nonce keeps identical choices distinct.
              </p>
            </article>
            <article>
              <span className="step">02</span>
              <h3>Self-send 1 µQOR</h3>
              <p>
                In QoreX, send <strong>0.000001 QOR</strong> to your own address with the memo.
                QoreX signs classically and with ML-DSA-87.
              </p>
            </article>
            <article>
              <span className="step">03</span>
              <h3>Paste the hash</h3>
              <p>
                The verifier checks the memo, amount, self-send, hybrid signature, deadline, and
                one-vote-per-address rule.
              </p>
            </article>
          </div>
        </section>

        {error && <div className="error-banner">{error}</div>}

        <section className="create-section" id="create">
          <div className="create-intro">
            <span className="section-label">New ballot</span>
            <h2>Put a question on the record.</h2>
            <p>
              Polls are stored off-chain, while every vote is independently anchored on QoreChain.
              Export the audit trail whenever you need to.
            </p>
            <div className="note-card">
              <strong>No custody.</strong> QorePoll never holds QOR. The self-send returns to the
              voter; only network fees leave the wallet.
            </div>
          </div>
          <CreatePoll
            onCreated={(poll) => {
              void refresh();
              navigate(`/poll/${poll.slug}`);
            }}
          />
        </section>

        <section className="polls-section" id="polls">
          <div className="section-heading">
            <div>
              <span className="section-label">Open record</span>
              <h2>Ballots</h2>
            </div>
            <span className="tiny">{polls.length} published</span>
          </div>
          {polls.length === 0 ? (
            <div className="empty">
              <strong>The ballot box is empty.</strong>
              <p>Create the first poll above.</p>
            </div>
          ) : (
            <div className="poll-grid">
              {polls.map((poll) => (
                <PollCard key={poll.slug} poll={poll} />
              ))}
            </div>
          )}
        </section>

        <section className="audit-section">
          <div className="section-heading">
            <div>
              <span className="section-label">Public audit log</span>
              <h2>Latest signatures</h2>
            </div>
            <span className="tiny">live from Diana</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty">
              <p>No votes verified yet. The first signature will appear here.</p>
            </div>
          ) : (
            <div className="audit-list">
              {recent.map((vote) => (
                <div className="audit-row" key={vote.id}>
                  <span className="audit-dot" />
                  <div>
                    <Link to={`/poll/${vote.pollSlug}`}>{vote.pollQuestion}</Link>
                    <span className="audit-choice">{vote.optionLabel}</span>
                  </div>
                  <code>{vote.voterShort ?? short(vote.voter)}</code>
                  <a href={vote.txUrl ?? `${EXPLORER}/tx/${vote.txHash}?network=testnet`} target="_blank" rel="noreferrer">
                    tx ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

function PollPage() {
  const { slug = "" } = useParams();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try {
      const next = await api<Poll>(`/api/polls/${slug}`);
      setPoll(next);
      document.title = `${next.question} · QorePoll`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [slug]);

  const leader = poll ? topOption(poll) : undefined;
  const leadPercent = useMemo(() => {
    if (!poll || poll.totalVotes === 0 || !leader) return 0;
    return Math.round((leader.votes / poll.totalVotes) * 100);
  }, [poll, leader]);

  function choose(index: number) {
    setSelected(index);
    setMemo(`qorepoll:${slug}:${index}:${randomNonce()}`);
    setNotice(null);
    setError(null);
  }

  async function copyMemo() {
    try {
      await navigator.clipboard.writeText(memo);
      setNotice("Memo copied. Paste it into the QoreX send form.");
    } catch {
      setNotice("Select and copy the memo manually.");
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ poll: Poll; vote: Vote }>(`/api/polls/${slug}/verify`, {
        method: "POST",
        body: JSON.stringify({ txHash }),
      });
      setPoll(result.poll);
      setTxHash("");
      setSelected(null);
      setMemo("");
      setNotice(`Vote counted for “${result.vote.optionLabel}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!poll && !error) {
    return (
      <>
        <TopBar />
        <main className="center-page">Loading ballot…</main>
      </>
    );
  }

  if (!poll) {
    return (
      <>
        <TopBar />
        <main className="center-page">
          <div className="error-banner">{error}</div>
          <Link to="/">Back to ballots</Link>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <main className="poll-page">
        <Link className="back-link" to="/">
          ← All ballots
        </Link>
        <header className="poll-header">
          <div className="poll-title">
            <div className="poll-badges">
              <span className={`status ${poll.status}`}>{poll.status}</span>
              <span className="poll-code">#{poll.slug}</span>
              <span className="tiny">{countdown(poll.deadline)}</span>
            </div>
            <h1>{poll.question}</h1>
            {poll.description && <p className="poll-description">{poll.description}</p>}
            <p className="poll-meta">
              Closes {formatDate(poll.deadline)} · {poll.totalVotes} verified vote
              {poll.totalVotes === 1 ? "" : "s"}
              {poll.minBalanceUqor !== "0" &&
                ` · ${(Number(poll.minBalanceUqor) / 1_000_000).toLocaleString()} QOR minimum balance`}
            </p>
          </div>
          <div className="tally-card">
            <span className="section-label">Current tally</span>
            <strong>{poll.totalVotes}</strong>
            <span>votes on chain</span>
            {leader && (
              <p>
                {leader.label} · {leadPercent}%
              </p>
            )}
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}
        {notice && <div className="notice-banner">{notice}</div>}

        <div className="ballot-layout">
          <section className="ballot">
            <div className="section-label">Choose one</div>
            <div className="choice-list">
              {poll.options.map((option) => {
                const percent = poll.totalVotes === 0 ? 0 : Math.round((option.votes / poll.totalVotes) * 100);
                return (
                  <button
                    type="button"
                    className={`choice ${selected === option.index ? "selected" : ""}`}
                    key={option.index}
                    onClick={() => choose(option.index)}
                    disabled={poll.status === "closed"}
                  >
                    <span className="choice-radio">{selected === option.index ? "●" : ""}</span>
                    <span className="choice-body">
                      <span className="choice-label">{option.label}</span>
                      <span className="choice-bar">
                        <span style={{ width: `${percent}%` }} />
                      </span>
                    </span>
                    <span className="choice-count">
                      <strong>{option.votes}</strong>
                      <span>{percent}%</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {poll.status === "closed" ? (
              <div className="closed-card">Voting closed {formatDate(poll.deadline)}.</div>
            ) : selected === null ? (
              <p className="hint">Select an option to generate your ballot memo.</p>
            ) : (
              <div className="vote-box">
                <div className="vote-box-head">
                  <span className="section-label">Your ballot</span>
                  <span className="tiny">0.000001 QOR self-send</span>
                </div>
                <code className="memo">{memo}</code>
                <div className="vote-actions">
                  <button type="button" className="button primary" onClick={copyMemo}>
                    Copy memo
                  </button>
                  <span className="tiny">
                    Open QoreX → Testnet → send to your own <code>qor1…</code> address.
                  </span>
                </div>
                <ol className="vote-steps">
                  <li>Send exactly <strong>0.000001 QOR</strong> to yourself.</li>
                  <li>Paste the memo above without changing it.</li>
                  <li>Sign with QoreX. The hybrid signature is required.</li>
                  <li>Copy the transaction hash and verify it below.</li>
                </ol>
              </div>
            )}

            <form className="verify-form" onSubmit={verify}>
              <label>
                Transaction hash
                <input
                  value={txHash}
                  onChange={(event) => setTxHash(event.target.value.trim())}
                  placeholder="64-character hex hash"
                  spellCheck={false}
                />
              </label>
              <button className="button dark" disabled={busy || txHash.length !== 64}>
                {busy ? "Checking chain…" : "Verify and count my vote"}
              </button>
            </form>
          </section>

          <aside className="side">
            <div className="side-card">
              <span className="section-label">Audit exports</span>
              <a href={`/api/polls/${poll.slug}/export.csv`}>Download CSV</a>
              <a href={`/api/polls/${poll.slug}/export.json`}>Download JSON</a>
              <p className="tiny">Every row includes the voter address, option, and transaction hash.</p>
            </div>
            <div className="side-card">
              <span className="section-label">Why this is different</span>
              <p>
                The vote is a normal bank send. There is no custom contract to deploy, and the
                ballot survives as long as QoreChain does.
              </p>
            </div>
            <div className="side-card">
              <span className="section-label">Verifier rules</span>
              <ul>
                <li>Memo shape and poll ID</li>
                <li>Exactly 1 uqor, self-send</li>
                <li>Hybrid signature present</li>
                <li>Included before the deadline</li>
                <li>One vote per address</li>
              </ul>
            </div>
          </aside>
        </div>

        <section className="receipts">
          <div className="section-heading">
            <div>
              <span className="section-label">On-chain receipts</span>
              <h2>Vote log</h2>
            </div>
            <span className="tiny">{poll.totalVotes} counted</span>
          </div>
          {!poll.recentVotes || poll.recentVotes.length === 0 ? (
            <div className="empty">
              <p>No votes yet. Be the first signature on this ballot.</p>
            </div>
          ) : (
            <div className="receipt-list">
              {poll.recentVotes.map((vote) => (
                <div className="receipt" key={vote.id}>
                  <span className="receipt-option">{vote.optionLabel}</span>
                  <code title={vote.voter}>{vote.voterShort ?? short(vote.voter)}</code>
                  <span className="tiny">{formatDate(vote.votedAt)}</span>
                  <a href={vote.txUrl ?? `${EXPLORER}/tx/${vote.txHash}?network=testnet`} target="_blank" rel="noreferrer">
                    {short(vote.txHash, 8, 6)} ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

function NotFound() {
  return (
    <>
      <TopBar />
      <main className="center-page">
        <h1>Not on the ballot.</h1>
        <Link to="/">Return to QorePoll</Link>
      </main>
      <Footer />
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/poll/:slug" element={<PollPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
