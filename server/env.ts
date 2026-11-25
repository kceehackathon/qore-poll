import "dotenv/config";

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  port: numberFromEnv(process.env.PORT, 8788),
  restUrl: process.env.QORE_REST_URL ?? "https://api-testnet.qore.host",
  rpcUrl: process.env.QORE_RPC_URL ?? "https://rpc-testnet.qore.host",
  explorerBaseUrl: process.env.QORE_EXPLORER_URL ?? "https://explore.qore.network",
  databaseUrl: process.env.DATABASE_URL ?? "./data/qorepoll.sqlite",
  network: "qorechain-diana",
  chainId: 9800,
} as const;
