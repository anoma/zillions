#!/usr/bin/env bash
# Runs the ignored real_ziziphus test against a live indexer: its Sapling tip
# and first tree chunk, plus the chain's own Sapling tree from lightwalletd.
set -euo pipefail
cd "$(dirname "$0")"

INDEXER_URL=${INDEXER_URL:-https://zcrawler.dev.heliax.app/api/v1}
GRPC_URL=${GRPC_URL:-https://zcash-mainnet.chainsafe.dev}
export ZIZIPHUS_DIR=${ZIZIPHUS_DIR:-$(mktemp -d)}

curl -sSfL -o "$ZIZIPHUS_DIR/sapling_tip.bin" "$INDEXER_URL/sapling/tip"
curl -sSfL -o "$ZIZIPHUS_DIR/sapling_tree0.bin" "$INDEXER_URL/sapling/trees/0"

# The chain's Sapling tree at the block holding exactly the tip's tree_size
# notes, from lightwalletd's GetTreeState over grpc-web.
python3 - "$GRPC_URL" "$ZIZIPHUS_DIR" <<'EOF'
import sys, urllib.request

url, out = sys.argv[1], sys.argv[2]
SERVICE = "cash.z.wallet.sdk.rpc.CompactTxStreamer"


def varint(n):
    b = bytearray()
    while True:
        x, n = n & 0x7F, n >> 7
        b.append(x | (0x80 if n else 0))
        if not n:
            return bytes(b)


def read_varint(buf, i):
    n = shift = 0
    while True:
        c = buf[i]
        i += 1
        n |= (c & 0x7F) << shift
        shift += 7
        if c < 0x80:
            return n, i


def call(method, msg):
    frame = b"\0" + len(msg).to_bytes(4, "big") + msg
    headers = {"Content-Type": "application/grpc-web+proto", "X-Grpc-Web": "1"}
    req = urllib.request.Request(f"{url}/{SERVICE}/{method}", frame, headers)
    data = urllib.request.urlopen(req, timeout=30).read()
    return data[5 : 5 + int.from_bytes(data[1:5], "big")]


def fields(buf):
    i, out = 0, {}
    while i < len(buf):
        key, i = read_varint(buf, i)
        if key & 7 == 0:
            out[key >> 3], i = read_varint(buf, i)
        else:
            n, i = read_varint(buf, i)
            out[key >> 3], i = buf[i : i + n], i + n
    return out


def tree_size(tree):
    # zcash's legacy CommitmentTree: Option<left>, Option<right>, Vec<Option<parent>>.
    b, i = bytes.fromhex(tree), 0

    def present():
        nonlocal i
        p = b[i]
        i += 1 + 32 * p
        return p

    n = present() + present()
    levels = b[i]
    i += 1
    for level in range(levels):
        if present():
            n += 1 << (level + 1)
    return n


tip = open(f"{out}/sapling_tip.bin", "rb").read()
target, _ = read_varint(tip, 0)  # TipBody's first field, postcard-encoded
height = fields(call("GetLatestBlock", b""))[1]
for h in range(height, height - 300, -1):
    tree = fields(call("GetTreeState", b"\x08" + varint(h)))[5].decode()
    size = tree_size(tree)
    if size == target:
        open(f"{out}/sapling_treestate.hex", "w").write(tree)
        print(f"chain tree: block {h}, {size} notes")
        break
    if size < target:
        print(f"no block holds exactly {target} notes; skipping the chain check")
        break
else:
    print("the indexer is 300+ blocks behind; skipping the chain check")
EOF

./patch-crates.sh
cargo test --release real_ziziphus -- --ignored --nocapture
