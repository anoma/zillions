/**
 * A fake indexer and lightwalletd for e2e: empty shielded trees, no history,
 * and one coin at the first transparent address asked about.
 */

import { createServer, type ServerResponse } from "node:http";

const PORT = 5291;
const TIP = 3_500_000;
const COIN = 1_000_000;

/** `/{pool}/tip/0`: postcard of an empty tree (size 0, no ommers or roots) and its zeroed filling chunk. */
const CHUNK_BYTES = ((1 << 15) - 1) * 32;
const emptyTip = Buffer.concat([
  Buffer.from([0, 0, 0]),
  Buffer.from(varint(CHUNK_BYTES)),
  Buffer.alloc(CHUNK_BYTES),
]);

function varint(n: number) {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
  return out;
}

const field = (number: number, value: number | Buffer) =>
  typeof value === "number"
    ? Buffer.from([...varint(number * 8), ...varint(value)])
    : Buffer.concat([
        Buffer.from([...varint(number * 8 + 2), ...varint(value.length)]),
        value,
      ]);

/** The string field a protobuf message opens with, behind a one-byte tag. */
function firstString(message: Buffer) {
  let i = 1;
  let length = 0;
  for (let shift = 0; ; shift += 7) {
    const byte = message[i++];
    length += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) break;
  }
  return message.subarray(i, i + length).toString();
}

const frame = (message: Buffer) => {
  const head = Buffer.alloc(5);
  head.writeUInt32BE(message.length, 1);
  return Buffer.concat([head, message]);
};

function lightwalletd(res: ServerResponse, method: string, body: Buffer) {
  const reply = (...messages: Buffer[]) => {
    res.writeHead(200, {
      "content-type": "application/grpc-web+proto",
      "grpc-status": "0",
    });
    res.end(Buffer.concat(messages.map(frame)));
  };
  switch (method) {
    case "GetLatestBlock":
      return reply(field(1, TIP));
    case "GetTaddressTransactions":
      return reply();
    case "GetAddressUtxos": {
      const address = firstString(body.subarray(5));
      const utxo = Buffer.concat([
        field(1, Buffer.alloc(32, 0xe2)),
        field(2, 0),
        field(4, COIN),
        field(5, TIP - 100),
        field(6, Buffer.from(address)),
      ]);
      return reply(field(1, utxo));
    }
    default:
      res.writeHead(200, { "grpc-status": "12", "grpc-message": method });
      res.end();
  }
}

createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-expose-headers", "grpc-status, grpc-message");
  if (req.method === "OPTIONS") return res.end();

  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const url = new URL(req.url!, "http://localhost");
    const lwd = /^\/lwd\/[\w.]+\/(\w+)$/.exec(url.pathname);
    if (lwd) return lightwalletd(res, lwd[1], Buffer.concat(chunks));
    if (/^\/indexer\/\w+\/tip$/.test(url.pathname)) {
      res.writeHead(302, { location: `${url.pathname}/0` });
      return res.end();
    }
    if (/^\/indexer\/\w+\/tip\/0$/.test(url.pathname)) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end(req.method === "HEAD" ? undefined : emptyTip);
    }
    res.writeHead(404);
    res.end();
  });
}).listen(PORT, () => console.log(`fake chain on :${PORT}`));
