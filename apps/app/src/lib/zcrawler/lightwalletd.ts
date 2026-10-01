/**
 * lightwalletd over grpc-web, for what the indexers don't serve: transparent
 * UTXOs and transactions. Protobuf is written by hand for the few messages
 * used; field numbers follow lightwalletd's `service.proto`.
 */

const LIGHTWALLETD_URL = import.meta.env.VITE_GRPC_URL;
const SERVICE = "cash.z.wallet.sdk.rpc.CompactTxStreamer";

type FieldValue = number | string | Uint8Array;

function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
  return out;
}

/** Encodes a message; a nested message goes in as its own encoded bytes. */
function message(fields: [number, FieldValue][]): Uint8Array {
  const out: number[] = [];
  for (const [field, value] of fields) {
    if (typeof value === "number") {
      out.push(...varint(field * 8), ...varint(value));
      continue;
    }
    const bytes =
      typeof value === "string" ? new TextEncoder().encode(value) : value;
    out.push(...varint(field * 8 + 2), ...varint(bytes.length), ...bytes);
  }
  return Uint8Array.from(out);
}

/** Decodes a message's fields by number; a repeated field keeps every value. */
function fields(buf: Uint8Array): Map<number, (number | Uint8Array)[]> {
  const out = new Map<number, (number | Uint8Array)[]>();
  let i = 0;
  const readVarint = () => {
    let n = 0;
    let scale = 1;
    let byte;
    do {
      byte = buf[i++];
      n += (byte & 0x7f) * scale;
      scale *= 0x80;
    } while (byte & 0x80);
    return n;
  };
  while (i < buf.length) {
    const tag = readVarint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    let value: number | Uint8Array;
    if (wire === 0) {
      value = readVarint();
    } else if (wire === 2) {
      const length = readVarint();
      value = buf.subarray(i, i + length);
      i += length;
    } else if (wire === 1 || wire === 5) {
      i += wire === 1 ? 8 : 4;
      continue;
    } else {
      throw new Error(`protobuf wire type ${wire} is not supported`);
    }
    out.set(field, [...(out.get(field) ?? []), value]);
  }
  return out;
}

const num = (m: Map<number, unknown[]>, field: number) =>
  (m.get(field)?.[0] as number | undefined) ?? 0;
const bytes = (m: Map<number, unknown[]>, field: number) =>
  (m.get(field)?.[0] as Uint8Array | undefined) ?? new Uint8Array();
const text = (m: Map<number, unknown[]>, field: number) =>
  new TextDecoder().decode(bytes(m, field));

/** Txids travel in internal byte order; explorers show them reversed. */
const displayTxid = (internal: Uint8Array) =>
  [...internal]
    .reverse()
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * One grpc-web call. The whole response is read before returning, so a
 * server stream arrives as the list of its messages.
 */
async function call(method: string, request: Uint8Array) {
  const frame = new Uint8Array(5 + request.length);
  new DataView(frame.buffer).setUint32(1, request.length);
  frame.set(request, 5);
  const res = await fetch(`${LIGHTWALLETD_URL}/${SERVICE}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/grpc-web+proto",
      "x-grpc-web": "1",
    },
    body: frame,
  });
  if (!res.ok) throw new Error(`lightwalletd ${method}: HTTP ${res.status}`);

  const body = new Uint8Array(await res.arrayBuffer());
  const messages: Uint8Array[] = [];
  let status = res.headers.get("grpc-status");
  let reason = res.headers.get("grpc-message");
  for (let i = 0; i < body.length; ) {
    const flag = body[i];
    const length = new DataView(
      body.buffer,
      body.byteOffset + i + 1,
      4,
    ).getUint32(0);
    const payload = body.subarray(i + 5, i + 5 + length);
    i += 5 + length;
    // The trailer frame carries the call's status as HTTP-style header lines.
    if (flag & 0x80) {
      const trailers = new TextDecoder().decode(payload);
      status = /grpc-status:\s*(\d+)/i.exec(trailers)?.[1] ?? status;
      reason = /grpc-message:\s*(.*)/i.exec(trailers)?.[1]?.trim() ?? reason;
    } else {
      messages.push(payload);
    }
  }
  if (status && status !== "0") {
    throw new Error(
      `lightwalletd ${method}: ${decodeURIComponent(reason ?? `status ${status}`)}`,
    );
  }
  return messages;
}

export async function fetchLatestHeight() {
  const [block] = await call("GetLatestBlock", new Uint8Array());
  return num(fields(block), 1);
}

/** An unspent transparent output. `txid` is in explorer byte order. */
export interface Utxo {
  address: string;
  txid: string;
  index: number;
  value: number;
  height: number;
}

export async function fetchUtxos(addresses: string[]): Promise<Utxo[]> {
  if (!addresses.length) return [];
  const [list] = await call(
    "GetAddressUtxos",
    message(addresses.map((address) => [1, address])),
  );
  return (fields(list).get(1) ?? []).map((reply) => {
    const utxo = fields(reply as Uint8Array);
    return {
      address: text(utxo, 6),
      txid: displayTxid(bytes(utxo, 1)),
      index: num(utxo, 2),
      value: num(utxo, 4),
      height: num(utxo, 5),
    };
  });
}

/** A mined transaction, raw, with the height of its block. */
export interface RawTransaction {
  data: Uint8Array;
  height: number;
}

/** Every transaction touching `address` mined within `[from, to]`. */
export async function fetchAddressTransactions(
  address: string,
  from: number,
  to: number,
): Promise<RawTransaction[]> {
  const blockId = (height: number) => message([[1, height]]);
  const range = message([
    [1, blockId(from)],
    [2, blockId(to)],
  ]);
  const txs = await call(
    "GetTaddressTransactions",
    message([
      [1, address],
      [2, range],
    ]),
  );
  return txs.map((tx) => {
    const raw = fields(tx);
    return { data: bytes(raw, 1), height: num(raw, 2) };
  });
}

/** What history needs from a block: when it was mined, and its txids by index. */
export interface Block {
  /** Unix seconds. */
  time: number;
  /** Transactions with a shielded part only: a compact block omits the rest. */
  txids: Map<number, string>;
}

export async function fetchBlock(height: number): Promise<Block> {
  const [compact] = await call("GetBlock", message([[1, height]]));
  const block = fields(compact);
  const txids = (block.get(7) ?? []).map((raw): [number, string] => {
    const tx = fields(raw as Uint8Array);
    return [num(tx, 1), displayTxid(bytes(tx, 2))];
  });
  return { time: num(block, 5), txids: new Map(txids) };
}

/** A mined transaction by txid, given in explorer byte order. */
export async function fetchTransaction(txid: string): Promise<RawTransaction> {
  const internal = Uint8Array.from(
    txid.match(/../g)!.map((byte) => parseInt(byte, 16)),
  ).reverse();
  const [tx] = await call("GetTransaction", message([[3, internal]]));
  const raw = fields(tx);
  return { data: bytes(raw, 1), height: num(raw, 2) };
}

/** Broadcasts a raw transaction; lightwalletd relays the node's verdict. */
export async function sendTransaction(raw: Uint8Array) {
  const [reply] = await call("SendTransaction", message([[1, raw]]));
  const response = fields(reply);
  if (num(response, 1) !== 0) {
    throw new Error(`Broadcast rejected: ${text(response, 2)}`);
  }
}
