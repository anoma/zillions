/* @ts-self-types="./zcore.d.ts" */

/**
 * Where a payment to `address` lands: `"shielded"` when it has a shielded
 * receiver, else `"transparent"` (TEX addresses too). `undefined` when it
 * isn't a valid address on `network`.
 * @param {string} network
 * @param {string} address
 * @returns {string | undefined}
 */
export function address_kind(network, address) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.address_kind(ptr0, len0, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    let v3;
    if (ret[0] !== 0) {
        v3 = getStringFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v3;
}

/**
 * The account at ZIP-32 index `hd_index`: `{ ufvk, transparent, unified }`.
 * @param {string} network
 * @param {Uint8Array} seed
 * @param {number} hd_index
 * @returns {any}
 */
export function derive_account(network, seed, hd_index) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.derive_account(ptr0, len0, ptr1, len1, hd_index);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Transparent addresses `from..from + count` on one BIP-44 chain of the
 * viewing key's account: `"external"` (receiving) or `"internal"` (change).
 * Empty when the viewing key has no transparent part.
 * @param {string} network
 * @param {string} ufvk
 * @param {string} scope
 * @param {number} from
 * @param {number} count
 * @returns {string[]}
 */
export function derive_transparent(network, ufvk, scope, from, count) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(scope, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.derive_transparent(ptr0, len0, ptr1, len1, ptr2, len2, from, count);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayJsValueFromWasm0(ret[0], ret[1]);
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v4;
}

/**
 * A new shielded address of the account `ufvk` names, unlinkable to its
 * others; nothing needs to remember it, the viewing key finds what it receives.
 * @param {string} network
 * @param {string} ufvk
 * @returns {string}
 */
export function fresh_address(network, ufvk) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.fresh_address(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Unused addresses in a row that end each chain when scanning:
 * `{ external, internal }`, upstream's defaults, so other wallets restoring
 * the phrase find every address this one hands out.
 * @returns {any}
 */
export function gap_limits() {
    const ret = wasm.gap_limits();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * What the app's GPU shader reads to do [`try_decrypt`]'s key agreement for
 * the same arguments: the pool's two ivk scalars (external, internal; 32
 * little-endian bytes each), then each note's ephemeral key as affine
 * coordinates, 64 bytes, from the first note `try_decrypt` would try. Empty
 * when the UFVK has no key for the pool.
 * @param {string} network
 * @param {string} ufvk
 * @param {string} pool
 * @param {Uint8Array} body
 * @param {number} from
 * @param {Uint8Array} tried
 * @returns {Uint8Array}
 */
export function gpu_inputs(network, ufvk, pool, body, from, tried) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(pool, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(body, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passArray8ToWasm0(tried, wasm.__wbindgen_malloc);
    const len4 = WASM_VECTOR_LEN;
    const ret = wasm.gpu_inputs(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, from, ptr4, len4);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v6 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v6;
}

/**
 * The most `send` (its `amount` ignored) can pay after fees, in zatoshis.
 * @param {string} network
 * @param {any} wallet
 * @param {any} send
 * @returns {bigint}
 */
export function max_send(network, wallet, send) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.max_send(ptr0, len0, wallet, send);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return BigInt.asUintN(64, ret[0]);
}

/**
 * Whether proving `pczt` needs the Sapling parameters (~51 MB to fetch).
 * @param {Uint8Array} pczt
 * @returns {boolean}
 */
export function needs_sapling_params(pczt) {
    const ptr0 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.needs_sapling_params(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] !== 0;
}

/**
 * The transparent side of a raw transaction mined at `height`, which fixes
 * the consensus rules it is read under, and what it shows of its shielded
 * one: `{ txid, inputs: [{ txid, index, address }], outputs: [{ index, value,
 * address }], nullifiers, value_balance, expiry_height }`.
 * @param {string} network
 * @param {number} height
 * @param {Uint8Array} data
 * @returns {any}
 */
export function parse_transaction(network, height, data) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.parse_transaction(ptr0, len0, height, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * What a PCZT moves: `{ network, fee }` and inputs and outputs per pool
 * (`transparent`, `sapling`, `orchard`, `ironwood`), values in zatoshis as
 * strings. Each output says whether it's `mine`, by the signing account's
 * `ufvk`; throws if an output's note or label doesn't match what's signed.
 * @param {string} network
 * @param {Uint8Array} pczt
 * @param {string} ufvk
 * @returns {any}
 */
export function pczt_summary(network, pczt, ufvk) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.pczt_summary(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * The plan for moving every spendable Orchard note to Ironwood with
 * privacy, as of `wallet`'s tip; each call draws a new order and timing.
 * @param {string} network
 * @param {any} wallet
 * @returns {any}
 */
export function plan_migration(network, wallet) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.plan_migration(ptr0, len0, wallet);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Plans a send: `wallet` is `{ tip, notes, utxos }` (unspent only), `send`
 * is `{ to, amount, memo?, from }`. Returns `{ steps: [{ inputs, payments,
 * change, fee }], fee }`, values in zatoshis.
 * @param {string} network
 * @param {any} wallet
 * @param {any} send
 * @returns {any}
 */
export function plan_send(network, wallet, send) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.plan_send(ptr0, len0, wallet, send);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Plans shielding every transparent coin: the same summary as [`plan_send`],
 * with the shielded value as change.
 * @param {string} network
 * @param {any} wallet
 * @returns {any}
 */
export function plan_shield(network, wallet) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.plan_shield(ptr0, len0, wallet);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Proves a signed PCZT and extracts its transaction: `{ txid, raw, expiry_height }`. The
 * Sapling parameters are needed only when [`needs_sapling_params`] says so.
 * Building the Halo2 proving key alone takes seconds; run it off the UI thread.
 * `on_stage(name)` is called as each slow step starts: `sapling-proofs`,
 * `proving-key`, `orchard-proof`, `ironwood-proof`, then `verifying`; each
 * is skipped when the transaction doesn't need it.
 * @param {Uint8Array} pczt
 * @param {Uint8Array | null} [sapling_spend]
 * @param {Uint8Array | null} [sapling_output]
 * @param {Function | null} [on_stage]
 * @returns {any}
 */
export function prove_pczt(pczt, sapling_spend, sapling_output, on_stage) {
    const ptr0 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(sapling_spend) ? 0 : passArray8ToWasm0(sapling_spend, wasm.__wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    var ptr2 = isLikeNone(sapling_output) ? 0 : passArray8ToWasm0(sapling_output, wasm.__wbindgen_malloc);
    var len2 = WASM_VECTOR_LEN;
    const ret = wasm.prove_pczt(ptr0, len0, ptr1, len1, ptr2, len2, isLikeNone(on_stage) ? 0 : addToExternrefTable0(on_stage));
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * The address a transparent output's `script` pays; `undefined` unless it's
 * P2PKH or P2SH.
 * @param {string} network
 * @param {Uint8Array} script
 * @returns {string | undefined}
 */
export function script_address(network, script) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(script, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.script_address(ptr0, len0, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    let v3;
    if (ret[0] !== 0) {
        v3 = getStringFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v3;
}

/**
 * The seed's ZIP-32 fingerprint, hex. Names the seed without revealing it.
 * @param {Uint8Array} seed
 * @returns {string}
 */
export function seed_fingerprint(seed) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.seed_fingerprint(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * The unsigned PCZT for `send`, planned as [`plan_send`] plans it, for the
 * seed account (`seed_fingerprint`, `hd_index`) behind `ufvk`. `trees` maps
 * each pool spent from to `{ tip, chunks: { [chunk]: body } }`: ziziphus's
 * raw tip snapshot and the frozen chunks holding the notes `plan_send` named.
 * A plan with transparent change sends it to internal address `change_index`,
 * which the caller keeps unused.
 * @param {string} network
 * @param {string} ufvk
 * @param {string} seed_fingerprint
 * @param {number} hd_index
 * @param {any} wallet
 * @param {any} send
 * @param {any} trees
 * @param {number | null} [change_index]
 * @returns {Uint8Array}
 */
export function send_pczt(network, ufvk, seed_fingerprint, hd_index, wallet, send, trees, change_index) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(seed_fingerprint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.send_pczt(ptr0, len0, ptr1, len1, ptr2, len2, hd_index, wallet, send, trees, isLikeNone(change_index) ? Number.MAX_SAFE_INTEGER : (change_index) >>> 0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}

/**
 * The unsigned PCZT shielding every transparent coin, planned as
 * [`plan_shield`] plans it; `trees` as for [`send_pczt`].
 * @param {string} network
 * @param {string} ufvk
 * @param {string} seed_fingerprint
 * @param {number} hd_index
 * @param {any} wallet
 * @param {any} trees
 * @returns {Uint8Array}
 */
export function shield_pczt(network, ufvk, seed_fingerprint, hd_index, wallet, trees) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(seed_fingerprint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.shield_pczt(ptr0, len0, ptr1, len1, ptr2, len2, hd_index, wallet, trees);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}

/**
 * The PCZT with every input the seed's account `hd_index` holds signed.
 * @param {string} network
 * @param {Uint8Array} pczt
 * @param {Uint8Array} seed
 * @param {number} hd_index
 * @returns {Uint8Array}
 */
export function sign_pczt(network, pczt, seed, hd_index) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.sign_pczt(ptr0, len0, ptr1, len1, ptr2, len2, hd_index);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}

/**
 * The account's spending secret in both encodings: `{ orchard, sapling }`.
 * @param {string} network
 * @param {Uint8Array} seed
 * @param {number} hd_index
 * @returns {any}
 */
export function spending_keys(network, seed, hd_index) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.spending_keys(ptr0, len0, ptr1, len1, hd_index);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Trial-decrypt one pool's `/ciphertexts` chunk, the raw response body,
 * against `ufvk`. `chunk` is its number, which fixes each note's position.
 * Notes before `from` are skipped while their records still fingerprint as
 * `tried`, the `digest` an earlier read returned; else all are tried.
 *
 * Returns `{ count, min_height, from, digest, hits: [{ pool, scope, value, nf_mine, index }] }`:
 * `from` is where it started, `digest` fingerprints all `count` notes.
 * @param {string} network
 * @param {string} ufvk
 * @param {string} pool
 * @param {number} chunk
 * @param {Uint8Array} body
 * @param {number} from
 * @param {Uint8Array} tried
 * @returns {any}
 */
export function try_decrypt(network, ufvk, pool, chunk, body, from, tried) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(pool, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(body, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passArray8ToWasm0(tried, wasm.__wbindgen_malloc);
    const len4 = WASM_VECTOR_LEN;
    const ret = wasm.try_decrypt(ptr0, len0, ptr1, len1, ptr2, len2, chunk, ptr3, len3, from, ptr4, len4);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Trial-decrypt one pool's chunk in full against `ufvk`: the raw
 * `/ciphertexts`, `/memos` and `/outgoing` bodies for chunk number `chunk`,
 * and the `index` of each hit [`try_decrypt`] found in it. Returns
 * `{ hits: [{ pool, scope, value, nf_mine, memo, recipient, height, tx_index, position }],
 *    sent: [{ pool, value, recipient, memo, height, tx_index, position }] }`.
 * @param {string} network
 * @param {string} ufvk
 * @param {string} pool
 * @param {number} chunk
 * @param {Uint8Array} ciphertexts
 * @param {Uint8Array} memos
 * @param {Uint8Array} outgoing
 * @param {Uint32Array} hits
 * @returns {any}
 */
export function try_decrypt_full(network, ufvk, pool, chunk, ciphertexts, memos, outgoing, hits) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(pool, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(ciphertexts, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passArray8ToWasm0(memos, wasm.__wbindgen_malloc);
    const len4 = WASM_VECTOR_LEN;
    const ptr5 = passArray8ToWasm0(outgoing, wasm.__wbindgen_malloc);
    const len5 = WASM_VECTOR_LEN;
    const ptr6 = passArray32ToWasm0(hits, wasm.__wbindgen_malloc);
    const len6 = WASM_VECTOR_LEN;
    const ret = wasm.try_decrypt_full(ptr0, len0, ptr1, len1, ptr2, len2, chunk, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * [`try_decrypt`] with its key agreement already done: `secrets` is the GPU
 * shader's output for [`gpu_inputs`] of the same arguments. Fails when a
 * spot check finds the GPU wrong; [`try_decrypt`] then answers instead.
 * @param {string} network
 * @param {string} ufvk
 * @param {string} pool
 * @param {number} chunk
 * @param {Uint8Array} body
 * @param {number} from
 * @param {Uint8Array} tried
 * @param {Uint32Array} secrets
 * @returns {any}
 */
export function try_decrypt_gpu(network, ufvk, pool, chunk, body, from, tried, secrets) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(pool, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(body, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passArray8ToWasm0(tried, wasm.__wbindgen_malloc);
    const len4 = WASM_VECTOR_LEN;
    const ptr5 = passArray32ToWasm0(secrets, wasm.__wbindgen_malloc);
    const len5 = WASM_VECTOR_LEN;
    const ret = wasm.try_decrypt_gpu(ptr0, len0, ptr1, len1, ptr2, len2, chunk, ptr3, len3, from, ptr4, len4, ptr5, len5);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * The shielded pools `ufvk` has a key for, newest first: Ironwood uses the
 * Orchard key. A Ledger's viewing key has no Sapling key.
 * @param {string} network
 * @param {string} ufvk
 * @returns {string[]}
 */
export function ufvk_pools(network, ufvk) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ufvk_pools(ptr0, len0, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayJsValueFromWasm0(ret[0], ret[1]);
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Builds the Halo2 proving and verifying keys now, for this instance's
 * proofs to skip; seconds of work, so call it off the UI thread.
 */
export function warm_prover() {
    wasm.warm_prover();
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_14af1003b8dd5ead: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_a2383202b9353e4c: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_92f62ee1427d9e49: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_b123553bed3bb382: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_02babf21faa37971: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_677f21e468d6b461: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_6137034ef55c9d0f: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_done_b41a1d26cdb37fb6: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_entries_fb6397112b1de25f: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_get_658f6698067d9515: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_6c896e0571ddae51: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_288889d017702237: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_a99f175873e5d9b8: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_828cef2aaacafc31: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_e15a2ff68ffdbef2: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_717808ad6a54bd9e: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_e3c31c892080e444: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_7f3c00c40364105e: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_d4bdea10311bd9cf: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_1dbf7428bba60a42: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_617a8cdb8bb1130e: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_ee2291f50781bf1d: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_with_length_3da0ad195f6f63ba: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_next_33784799010f1bbe: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_f4aac29c42af995c: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_bc27214492979395: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_bea140a88be9b277: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_002b94d5e13d1411: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_value_f3c585ee8f5ba40c: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000005: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./zcore_bg.js": import0,
    };
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('zcore_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
