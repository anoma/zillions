// Copyright 2026 Heliax AG
// SPDX-License-Identifier: Apache-2.0, MIT

//! Merkle witnesses from ziziphus's two-tier trees, assembled offline so the
//! server never learns which notes are ours.
//!
//! A depth-32 tree is split at depth 14: each chunk of 2^14 leaves is a flat
//! binary heap (`root = 0`, children of `i` at `2i + 1` and `2i + 2`, leaves
//! from `2^14 - 1`), and the chunk roots are the leaves of an upper tree of
//! depth 18. Frozen chunks come from `/{pool}/trees/{chunk}`; the tip snapshot
//! (`/{pool}/tip`) carries every frozen root and the chunk still filling.
//!
//! In that filling chunk ziziphus only writes a node once its whole subtree is
//! full, so a node over unfilled leaves is recomputed here, never read.

use incrementalmerkletree::{Hashable, Level};
use serde::Deserialize;

/// Leaves per chunk, and the chunk's depth.
const CHUNK_DEPTH: u8 = 14;
const CHUNK_LEAVES: u64 = 1 << CHUNK_DEPTH;
/// Nodes in a chunk heap.
const CHUNK_NODES: usize = (1 << (CHUNK_DEPTH + 1)) - 1;
const UPPER_DEPTH: u8 = 32 - CHUNK_DEPTH;

/// A tree node that round-trips through ziziphus's 32 bytes.
pub(crate) trait Node: Hashable + Clone {
    fn read(bytes: &[u8]) -> Result<Self, String>;
}

impl Node for orchard::tree::MerkleHashOrchard {
    fn read(bytes: &[u8]) -> Result<Self, String> {
        let bytes: [u8; 32] = bytes.try_into().map_err(|_| "hash is not 32 bytes")?;
        Option::from(Self::from_bytes(&bytes)).ok_or_else(|| "bad orchard tree node".into())
    }
}

impl Node for sapling::Node {
    fn read(bytes: &[u8]) -> Result<Self, String> {
        let bytes: [u8; 32] = bytes.try_into().map_err(|_| "hash is not 32 bytes")?;
        Option::from(Self::from_bytes(bytes)).ok_or_else(|| "bad sapling tree node".into())
    }
}

/// `/{pool}/tip/{tree_size}`'s postcard body.
#[derive(Deserialize)]
#[cfg_attr(test, derive(serde::Serialize))]
pub(crate) struct TipBody {
    pub(crate) tree_size: u64,
    /// Unused: the root comes from `roots`. (Served as far more than the ≤ 18
    /// the design describes.)
    #[allow(dead_code)]
    pub(crate) ommers: Vec<[u8; 32]>,
    pub(crate) roots: Vec<[u8; 32]>,
    pub(crate) active_chunk: Vec<u8>,
}

/// `/{pool}/trees/{chunk}`'s postcard body.
#[derive(Deserialize)]
pub(crate) struct TreeChunkBody {
    pub(crate) data: Vec<u8>,
}

/// One chunk heap, of which the first `filled` leaves are real.
struct Chunk<'a> {
    heap: &'a [u8],
    filled: u64,
}

impl Chunk<'_> {
    /// Heap node `index`, at `level` above the leaves.
    fn node<H: Node>(&self, index: usize, level: u8) -> Result<H, String> {
        // The leaves under a node: the heap's level-`level` row, left to right.
        let row_start = (1usize << (CHUNK_DEPTH - level)) - 1;
        let first_leaf = ((index - row_start) as u64) << level;
        let width = 1u64 << level;
        if first_leaf >= self.filled {
            return Ok(H::empty_root(Level::from(level)));
        }
        if first_leaf + width <= self.filled {
            return H::read(&self.heap[index * 32..index * 32 + 32]);
        }
        let left = self.node::<H>(2 * index + 1, level - 1)?;
        let right = self.node::<H>(2 * index + 2, level - 1)?;
        Ok(H::combine(Level::from(level - 1), &left, &right))
    }

    /// The 14 siblings of leaf `leaf`, bottom up.
    fn path<H: Node>(&self, leaf: u64) -> Result<Vec<H>, String> {
        let mut index = (CHUNK_LEAVES - 1 + leaf) as usize;
        let mut path = Vec::with_capacity(CHUNK_DEPTH as usize);
        for level in 0..CHUNK_DEPTH {
            let sibling = if index % 2 == 1 { index + 1 } else { index - 1 };
            path.push(self.node::<H>(sibling, level)?);
            index = (index - 1) / 2;
        }
        Ok(path)
    }
}

/// The upper tree over chunk roots: `leaves[i]` is chunk `i`'s root.
struct Upper<H> {
    leaves: Vec<H>,
}

impl<H: Node> Upper<H> {
    /// The subtree of `2^height` chunks starting at chunk `start`.
    fn node(&self, start: u64, height: u8) -> H {
        let level = Level::from(CHUNK_DEPTH + height);
        if start >= self.leaves.len() as u64 {
            return H::empty_root(level);
        }
        if height == 0 {
            return self.leaves[start as usize].clone();
        }
        let half = 1u64 << (height - 1);
        let left = self.node(start, height - 1);
        let right = self.node(start + half, height - 1);
        H::combine(level - 1, &left, &right)
    }

    fn root(&self) -> H {
        self.node(0, UPPER_DEPTH)
    }

    /// The 18 siblings of chunk `chunk`, bottom up.
    fn path(&self, chunk: u64) -> Vec<H> {
        (0..UPPER_DEPTH)
            .map(|height| {
                let sibling = (chunk >> height) ^ 1;
                self.node(sibling << height, height)
            })
            .collect()
    }
}

/// A tip snapshot, read: every chunk root, the filling chunk included.
pub(crate) struct Tip<'a, H> {
    tree_size: u64,
    active: Chunk<'a>,
    upper: Upper<H>,
}

impl<'a, H: Node> Tip<'a, H> {
    pub(crate) fn new(body: &'a TipBody) -> Result<Self, String> {
        if body.active_chunk.len() != CHUNK_NODES * 32 {
            return Err("tip's active chunk has the wrong size".into());
        }
        let frozen = body.tree_size / CHUNK_LEAVES;
        if body.roots.len() as u64 != frozen {
            return Err("tip's roots don't match its tree size".into());
        }
        let active = Chunk { heap: &body.active_chunk, filled: body.tree_size % CHUNK_LEAVES };
        let mut leaves = body.roots.iter().map(|r| H::read(r)).collect::<Result<Vec<_>, _>>()?;
        if active.filled > 0 {
            leaves.push(active.node(0, CHUNK_DEPTH)?);
        }
        Ok(Tip { tree_size: body.tree_size, active, upper: Upper { leaves } })
    }

    /// The tree's root at this tip: the anchor a spend proves against.
    pub(crate) fn root(&self) -> H {
        self.upper.root()
    }

    /// The 32 siblings of the note at `position`, bottom up. A note in a
    /// frozen chunk needs that chunk's heap (`frozen`); one in the filling
    /// chunk is served from the tip.
    pub(crate) fn path(&self, position: u64, frozen: Option<&TreeChunkBody>) -> Result<Vec<H>, String> {
        if position >= self.tree_size {
            return Err("note is past this tip".into());
        }
        let chunk = position / CHUNK_LEAVES;
        let leaf = position % CHUNK_LEAVES;
        let mut path = if chunk < self.upper.leaves.len() as u64 && self.active.filled > 0 && chunk == self.tree_size / CHUNK_LEAVES {
            self.active.path(leaf)?
        } else {
            let body = frozen.ok_or("a frozen note needs its chunk's heap")?;
            if body.data.len() != CHUNK_NODES * 32 {
                return Err("chunk heap has the wrong size".into());
            }
            Chunk { heap: &body.data, filled: CHUNK_LEAVES }.path(leaf)?
        };
        path.extend(self.upper.path(chunk));
        Ok(path)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use incrementalmerkletree::frontier::Frontier;
    use orchard::tree::MerkleHashOrchard as H;

    /// A tip snapshot of `leaves`, all in the filling chunk.
    pub(crate) fn snapshot(leaves: &[H]) -> TipBody {
        TipBody { tree_size: leaves.len() as u64, ommers: vec![], roots: vec![], active_chunk: heap(leaves) }
    }

    pub(crate) fn leaf(i: u64) -> H {
        // Any valid field element serves as a leaf; the empty leaf's root
        // shifted by position keeps them distinct.
        let mut bytes = H::empty_leaf().to_bytes();
        bytes[0] ^= (i & 0x3f) as u8;
        bytes[1] ^= ((i >> 6) & 0x3f) as u8;
        bytes[2] ^= ((i >> 12) & 0x3f) as u8;
        H::from_bytes(&bytes).unwrap()
    }

    /// A chunk heap as ziziphus stores it: leaves, complete subtrees hashed,
    /// every other node left as the empty leaf.
    fn heap(leaves: &[H]) -> Vec<u8> {
        let mut nodes = vec![H::empty_leaf(); CHUNK_NODES];
        for (i, l) in leaves.iter().enumerate() {
            nodes[CHUNK_LEAVES as usize - 1 + i] = *l;
        }
        for level in 1..=CHUNK_DEPTH {
            let row = (1usize << (CHUNK_DEPTH - level)) - 1;
            for j in 0..(1usize << (CHUNK_DEPTH - level)) {
                if ((j as u64 + 1) << level) <= leaves.len() as u64 {
                    let i = row + j;
                    nodes[i] = H::combine(Level::from(level - 1), &nodes[2 * i + 1], &nodes[2 * i + 2]);
                }
            }
        }
        nodes.iter().flat_map(|n| n.to_bytes()).collect()
    }

    /// Real ziziphus data: a frozen chunk's leaves hash to the root the tip
    /// lists, and the tree root matches the chain's (lightwalletd
    /// `GetTreeState` at the block with exactly `tree_size` notes, saved as
    /// hex). Point `ZIZIPHUS_DIR` at `sapling_tip.bin`, `sapling_tree0.bin`
    /// and `sapling_treestate.hex`.
    #[test]
    #[ignore]
    fn real_ziziphus_data_is_consistent() {
        let dir = std::env::var("ZIZIPHUS_DIR").expect("ZIZIPHUS_DIR");
        let tip: TipBody = postcard::from_bytes(&std::fs::read(format!("{dir}/sapling_tip.bin")).unwrap()).unwrap();
        let chunk0: TreeChunkBody = postcard::from_bytes(&std::fs::read(format!("{dir}/sapling_tree0.bin")).unwrap()).unwrap();
        let parsed = Tip::<sapling::Node>::new(&tip).unwrap();
        println!("tree size {}, {} roots", tip.tree_size, tip.roots.len());

        let own_root = Chunk { heap: &chunk0.data, filled: CHUNK_LEAVES }.node::<sapling::Node>(0, CHUNK_DEPTH).unwrap();
        assert_eq!(own_root.to_bytes(), tip.roots[0]);
        // Recomputed from the leaves, not read: the heap's root is honest.
        let recomputed = {
            let leaves: Vec<sapling::Node> =
                (0..CHUNK_LEAVES as usize).map(|i| sapling::Node::read(&chunk0.data[(CHUNK_LEAVES as usize - 1 + i) * 32..][..32]).unwrap()).collect();
            let mut f = Frontier::<sapling::Node, 14>::empty();
            leaves.into_iter().for_each(|l| { f.append(l); });
            f.root()
        };
        assert_eq!(recomputed.to_bytes(), tip.roots[0]);
        println!("root {}", hex::encode(parsed.root().to_bytes()));

        // The chain's own Sapling tree at the block with exactly this many
        // notes (lightwalletd `GetTreeState`), when saved alongside.
        if let Ok(hex) = std::fs::read_to_string(format!("{dir}/sapling_treestate.hex")) {
            let tree = zcash_primitives::merkle_tree::read_commitment_tree::<sapling::Node, _, 32>(
                &hex::decode(hex.trim()).unwrap()[..],
            )
            .unwrap();
            assert_eq!(tree.size() as u64, tip.tree_size);
            assert_eq!(tree.root(), parsed.root(), "our root differs from the chain's");
            println!("matches the chain's Sapling root");
        }
    }

    #[test]
    fn witnesses_match_an_independent_tree() {
        // One frozen chunk and 1,000 leaves into the next.
        let count = CHUNK_LEAVES + 1_000;
        let leaves: Vec<H> = (0..count).map(leaf).collect();
        let mut frontier = Frontier::<H, 32>::empty();
        for l in &leaves {
            frontier.append(*l);
        }

        let frozen = TreeChunkBody { data: heap(&leaves[..CHUNK_LEAVES as usize]) };
        let body = TipBody {
            tree_size: count,
            ommers: vec![],
            roots: vec![H::read(&frozen.data[..32]).unwrap().to_bytes()],
            active_chunk: heap(&leaves[CHUNK_LEAVES as usize..]),
        };
        let tip = Tip::<H>::new(&body).unwrap();
        assert_eq!(tip.root(), frontier.root());

        for position in [0, 5, CHUNK_LEAVES - 1, CHUNK_LEAVES, CHUNK_LEAVES + 999] {
            let path = tip.path(position, Some(&frozen)).unwrap();
            let path: [H; 32] = path.try_into().unwrap();
            let merkle = orchard::tree::MerklePath::from_parts(position as u32, path);
            let cmx = orchard::note::ExtractedNoteCommitment::from_bytes(&leaves[position as usize].to_bytes()).unwrap();
            assert_eq!(merkle.root(cmx), orchard::Anchor::from(frontier.root()), "position {position}");
        }
        assert!(tip.path(count, None).is_err());
    }
}
