import { evmToQor, isValidBech32, qorToEvm } from "@qorechain/sdk";

import { env } from "./env.js";

export interface NormalizedAddress {
  address: string;
  evmAddress: string;
}

export function normalizeAddress(input: string): NormalizedAddress | null {
  const value = input.trim();
  if (!value) return null;
  try {
    if (value.startsWith("0x") && /^0x[0-9a-fA-F]{40}$/.test(value)) {
      const address = evmToQor(value);
      return { address, evmAddress: qorToEvm(address) };
    }
    if (value.startsWith("qor1") && isValidBech32(value, "qor")) {
      return { address: value, evmAddress: qorToEvm(value) };
    }
  } catch {
    return null;
  }
  return null;
}

export function shortAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function explorerTxUrl(hash: string): string {
  return `${env.explorerBaseUrl}/tx/${hash}?network=testnet`;
}

export function explorerAddressUrl(address: string): string {
  return `${env.explorerBaseUrl}/address/${address}?network=testnet`;
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(env.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Qore RPC ${method} failed: HTTP ${response.status}`);
  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (payload.error) throw new Error(`Qore RPC ${method} failed: ${payload.error.message ?? "unknown error"}`);
  if (payload.result === undefined) throw new Error(`Qore RPC ${method} returned no result`);
  return payload.result;
}

export interface DecodedTx {
  hash: string;
  height: number;
  code: number;
  memo: string;
  timestamp: string;
  messages: Array<Record<string, unknown>>;
  isHybrid: boolean;
}

interface RestTxResponse {
  tx?: {
    body?: {
      messages?: Array<Record<string, unknown>>;
      memo?: string;
      extension_options?: Array<Record<string, unknown>>;
      non_critical_extension_options?: Array<Record<string, unknown>>;
    };
  };
  tx_response?: {
    txhash?: string;
    height?: string;
    code?: number;
    timestamp?: string;
    events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
  };
}

function findHybridExtension(tx: RestTxResponse["tx"]): boolean {
  const options = [
    ...(tx?.body?.extension_options ?? []),
    ...(tx?.body?.non_critical_extension_options ?? []),
  ];
  return options.some((option) => {
    const type = String(option["@type"] ?? option.type_url ?? option.typeUrl ?? "");
    return type.includes("PQCHybridSignature");
  });
}

export async function getDecodedTx(hash: string): Promise<DecodedTx | null> {
  const response = await fetch(`${env.restUrl}/cosmos/tx/v1beta1/txs/${hash}`);
  if (!response.ok) return null;
  const payload = (await response.json()) as RestTxResponse;
  const data = payload.tx_response;
  if (!data) return null;
  const events = data.events ?? [];
  const verifiedEvent = events.some(
    (event) =>
      event.type === "pqc_hybrid_verify" &&
      event.attributes.some((entry) => entry.key === "status" && entry.value === "verified"),
  );
  return {
    hash: data.txhash ?? hash,
    height: Number(data.height ?? 0),
    code: Number(data.code ?? 0),
    memo: payload.tx?.body?.memo ?? "",
    timestamp: data.timestamp ?? new Date(0).toISOString(),
    messages: payload.tx?.body?.messages ?? [],
    isHybrid: verifiedEvent || findHybridExtension(payload.tx),
  };
}

export function messageType(message: Record<string, unknown>): string {
  return String(message["@type"] ?? message.type ?? message.typeUrl ?? "");
}

export function formatUqor(raw: string | number | bigint): string {
  const value = BigInt(raw);
  const whole = value / 1_000_000n;
  const fraction = value % 1_000_000n;
  if (fraction === 0n) return `${whole.toString()} QOR`;
  return `${whole.toString()}.${fraction.toString().padStart(6, "0").replace(/0+$/, "")} QOR`;
}

export interface NativeBalance {
  denom: string;
  amount: string;
}

export async function getBalances(address: string): Promise<NativeBalance[]> {
  const response = await fetch(`${env.restUrl}/cosmos/bank/v1beta1/balances/${address}`);
  if (!response.ok) throw new Error(`balance lookup failed: HTTP ${response.status}`);
  const payload = (await response.json()) as { balances?: NativeBalance[] };
  return payload.balances ?? [];
}

export async function getUqorBalance(address: string): Promise<bigint> {
  const balances = await getBalances(address);
  return BigInt(balances.find((entry) => entry.denom === "uqor")?.amount ?? "0");
}

export async function getLatestHeight(): Promise<number> {
  const result = await rpc<{ sync_info?: { latest_block_height?: string } }>("status", {});
  const height = Number(result.sync_info?.latest_block_height ?? 0);
  if (!Number.isFinite(height) || height <= 0) throw new Error("RPC status returned no height");
  return height;
}
