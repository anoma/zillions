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
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
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
 * `pczt` with a Ledger's `signatures` applied: `{ orchard, ironwood,
 * transparent }`, each a list of hex signatures in the order the kit returns
 * them. Throws if one doesn't sign this PCZT.
 * @param {Uint8Array | number[]} pczt
 * @param {any} signatures
 * @returns {Uint8Array}
 */
export function apply_ledger_signatures(pczt, signatures) {
    const ptr0 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.apply_ledger_signatures(ptr0, len0, signatures);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * A link's claim, signed and ready to prove: its one note (as sync encodes
 * notes, hex) at `position` → `to`, less the claim fee. `trees` are the
 * Ironwood tree data, as for a send; `claimer_ufvk` keeps the creator from
 * seeing where it went. `tip` is the chain's height now.
 * @param {string} network
 * @param {Uint8Array | number[]} key
 * @param {string} note
 * @param {bigint} position
 * @param {any} trees
 * @param {string} to
 * @param {string} claimer_ufvk
 * @param {number} tip
 * @returns {Uint8Array}
 */
export function claim_pczt(network, key, note, position, trees, to, claimer_ufvk, tip) {
    const val6 = BigInt.asIntN(64, position);
    const val7 = +tip;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(key, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(note, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passStringToWasm0(to, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passStringToWasm0(claimer_ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len4 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.claim_pczt(ptr0, len0, ptr1, len1, ptr2, len2, val6, trees, ptr3, len3, ptr4, len4, val7);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v8 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v8;
}

/**
 * The second PCZT's signatures and proofs merged into the first: the
 * keychain's copy (every input but the device's still unsigned) plus the
 * device's signed-and-redacted export makes the complete signed PCZT.
 * @param {Uint8Array | number[]} pczt0
 * @param {Uint8Array | number[]} pczt1
 * @returns {Uint8Array}
 */
export function combine_pczts(pczt0, pczt1) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArray8ToWasm0(pczt0, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(pczt1, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.combine_pczts(ptr0, len0, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * The account at ZIP-32 index `hd_index`: `{ ufvk, transparent, unified }`.
 * @param {string} network
 * @param {Uint8Array | number[]} seed
 * @param {number} hd_index
 * @returns {any}
 */
export function derive_account(network, seed, hd_index) {
    const val3 = +hd_index;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.derive_account(ptr0, len0, ptr1, len1, val3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * The account at unified full viewing key `ufvk` (a device's export):
 * `{ ufvk, transparent, unified }`.
 * @param {string} network
 * @param {string} ufvk
 * @returns {any}
 */
export function derive_account_from_ufvk(network, ufvk) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.derive_account_from_ufvk(ptr0, len0, ptr1, len1);
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
    const val4 = +from;
    const val5 = +count;
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(scope, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.derive_transparent(ptr0, len0, ptr1, len1, ptr2, len2, val4, val5);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v6 = getArrayJsValueFromWasm0(ret[0], ret[1]);
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v6;
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
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
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
 * @param {Uint8Array | number[]} body
 * @param {number} from
 * @param {Uint8Array | number[]} tried
 * @returns {Uint8Array}
 */
export function gpu_inputs(network, ufvk, pool, body, from, tried) {
    const val6 = +from;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(pool, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray8ToWasm0(body, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArray8ToWasm0(tried, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.gpu_inputs(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, val6, ptr4, len4);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v7 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v7;
}

/**
 * The link's address and nullifier key: `{ address, nk }`.
 * @param {string} network
 * @param {Uint8Array | number[]} key
 * @returns {any}
 */
export function link_info(network, key) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(key, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.link_info(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
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
 * @param {Uint8Array | number[]} pczt
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
 * 32 random bytes that make an Orchard spending key: a new link.
 * @returns {Uint8Array}
 */
export function new_link_key() {
    const ret = wasm.new_link_key();
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * The link key back from its seal and nullifier key, both from the memo.
 * @param {string} network
 * @param {Uint8Array | number[]} seed
 * @param {number} hd_index
 * @param {Uint8Array | number[]} sealed
 * @param {Uint8Array | number[]} nk
 * @returns {Uint8Array}
 */
export function open_link_key(network, seed, hd_index, sealed, nk) {
    const val5 = +hd_index;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray8ToWasm0(sealed, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray8ToWasm0(nk, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.open_link_key(ptr0, len0, ptr1, len1, val5, ptr2, len2, ptr3, len3);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v6 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v6;
}

/**
 * The transparent side of a raw transaction mined at `height`, which fixes
 * the consensus rules it is read under, and what it shows of its shielded
 * one: `{ txid, inputs: [{ txid, index, address }], outputs: [{ index, value,
 * address }], nullifiers, value_balance, expiry_height }`.
 * @param {string} network
 * @param {number} height
 * @param {Uint8Array | number[]} data
 * @returns {any}
 */
export function parse_transaction(network, height, data) {
    const val3 = +height;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.parse_transaction(ptr0, len0, val3, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * A Keystone's firmware version, from the `keystone:fw_version` stamp its
 * signed PCZT responses carry in the global's proprietary map — the raw
 * `[major, minor, build]` bytes as "13.0.8". The device displays major
 * minus 10 ("3.0.8"); firmware that doesn't stamp has no readable version.
 * @param {Uint8Array | number[]} pczt
 * @returns {string | undefined}
 */
export function pczt_keystone_fw_version(pczt) {
    const ptr0 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.pczt_keystone_fw_version(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    let v2;
    if (ret[0] !== 0) {
        v2 = getStringFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v2;
}

/**
 * The PCZT `pczt` as `@ledgerhq/device-signer-kit-zcash`'s
 * `signPcztTransaction` takes it, for the account at ZIP 32 index `hd_index`:
 * byte fields as `Uint8Array`s, amounts as `bigint`s. Throws on a Sapling
 * spend or output, which a Ledger can't sign.
 * @param {string} network
 * @param {Uint8Array | number[]} pczt
 * @param {number} hd_index
 * @returns {any}
 */
export function pczt_ledger_transaction(network, pczt, hd_index) {
    const val3 = +hd_index;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.pczt_ledger_transaction(ptr0, len0, ptr1, len1, val3);
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
 * @param {Uint8Array | number[]} pczt
 * @param {string} ufvk
 * @returns {any}
 */
export function pczt_summary(network, pczt, ufvk) {
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
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
 * The next preparation for `parts` (each a transfer's amount) still without
 * a note: `{ plan, made }`, its plan as `plan_send` reports one and how many
 * parts it makes. Errors starting "not ready" mean waiting for older notes.
 * @param {string} network
 * @param {any} wallet
 * @param {BigUint64Array | bigint[]} parts
 * @returns {any}
 */
export function plan_preparation(network, wallet, parts) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray64ToWasm0(parts, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.plan_preparation(ptr0, len0, wallet, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Plans a send: `wallet` is `{ tip, notes, utxos }` (unspent only), `send`
 * is `{ to, amount, memo?, from }`. Returns `{ steps: [{ inputs, payments,
 * change, fee }], fee, bucket? }`, values in zatoshis.
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
 * The unsigned PCZT of the preparation [`plan_preparation`] plans, for the
 * seed account (`seed_fingerprint`, `hd_index`) behind `ufvk`; `trees` as
 * `send_pczt` takes them.
 * @param {string} network
 * @param {string} ufvk
 * @param {string} seed_fingerprint
 * @param {number} hd_index
 * @param {any} wallet
 * @param {BigUint64Array | bigint[]} parts
 * @param {any} trees
 * @returns {Uint8Array}
 */
export function preparation_pczt(network, ufvk, seed_fingerprint, hd_index, wallet, parts, trees) {
    const val5 = +hd_index;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(seed_fingerprint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray64ToWasm0(parts, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 8, 8); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.preparation_pczt(ptr0, len0, ptr1, len1, ptr2, len2, val5, wallet, ptr3, len3, trees);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v6 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v6;
}

/**
 * Proves a signed PCZT and extracts its transaction: `{ txid, raw, expiry_height }`. The
 * Sapling parameters are needed only when [`needs_sapling_params`] says so.
 * Building the Halo2 proving key alone takes seconds; run it off the UI thread.
 * `on_stage(name)` is called as each slow step starts: `sapling-proofs`,
 * `proving-key`, `orchard-proof`, `ironwood-proof`, then `verifying`; each
 * is skipped when the transaction doesn't need it.
 * @param {Uint8Array | number[]} pczt
 * @param {Uint8Array | number[] | null} [sapling_spend]
 * @param {Uint8Array | number[] | null} [sapling_output]
 * @param {Function | null} [on_stage]
 * @returns {any}
 */
export function prove_pczt(pczt, sapling_spend, sapling_output, on_stage) {
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = isLikeNone(sapling_spend) ? 0 : passArray8ToWasm0(sapling_spend, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = isLikeNone(sapling_output) ? 0 : passArray8ToWasm0(sapling_output, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
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
 * @param {Uint8Array | number[]} script
 * @returns {string | undefined}
 */
export function script_address(network, script) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(script, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
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
 * The link key sealed to the account at `hd_index`, for the funding memo.
 * @param {string} network
 * @param {Uint8Array | number[]} seed
 * @param {number} hd_index
 * @param {Uint8Array | number[]} key
 * @returns {Uint8Array}
 */
export function seal_link_key(network, seed, hd_index, key) {
    const val4 = +hd_index;
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray8ToWasm0(key, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.seal_link_key(ptr0, len0, ptr1, len1, val4, ptr2, len2);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v5 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v5;
}

/**
 * The seed's ZIP-32 fingerprint, hex. Names the seed without revealing it.
 * @param {Uint8Array | number[]} seed
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
    const val4 = +hd_index;
    const val5 = +(isLikeNone(change_index) ? Number.MAX_SAFE_INTEGER : (change_index) >>> 0);
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(seed_fingerprint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.send_pczt(ptr0, len0, ptr1, len1, ptr2, len2, val4, wallet, send, trees, val5);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v6 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v6;
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
    const val4 = +hd_index;
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(seed_fingerprint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.shield_pczt(ptr0, len0, ptr1, len1, ptr2, len2, val4, wallet, trees);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v5 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v5;
}

/**
 * The PCZT with every input the seed's account `hd_index` holds signed.
 * @param {string} network
 * @param {Uint8Array | number[]} pczt
 * @param {Uint8Array | number[]} seed
 * @param {number} hd_index
 * @returns {Uint8Array}
 */
export function sign_pczt(network, pczt, seed, hd_index) {
    const val4 = +hd_index;
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(pczt, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.sign_pczt(ptr0, len0, ptr1, len1, ptr2, len2, val4);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v5 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v5;
}

/**
 * What `from` (`"shielded"` or `"transparent"`) can spend before fees, in
 * zatoshis: `{ now, later }`, `later` once every note is confirmed. Dust,
 * which [`plan_send`] never picks, counts in neither.
 * @param {string} network
 * @param {any} wallet
 * @param {string} from
 * @returns {any}
 */
export function spendable(network, wallet, from) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(from, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.spendable(ptr0, len0, wallet, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * The account's spending secret in both encodings: `{ orchard, sapling }`.
 * @param {string} network
 * @param {Uint8Array | number[]} seed
 * @param {number} hd_index
 * @returns {any}
 */
export function spending_keys(network, seed, hd_index) {
    const val3 = +hd_index;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.spending_keys(ptr0, len0, ptr1, len1, val3);
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
 * @param {Uint8Array | number[]} body
 * @param {number} from
 * @param {Uint8Array | number[]} tried
 * @returns {any}
 */
export function try_decrypt(network, ufvk, pool, chunk, body, from, tried) {
    const val6 = +chunk;
    const val7 = +from;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(pool, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray8ToWasm0(body, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArray8ToWasm0(tried, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.try_decrypt(ptr0, len0, ptr1, len1, ptr2, len2, val6, ptr3, len3, val7, ptr4, len4);
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
 * @param {Uint8Array | number[]} ciphertexts
 * @param {Uint8Array | number[]} memos
 * @param {Uint8Array | number[]} outgoing
 * @param {Uint32Array | number[]} hits
 * @returns {any}
 */
export function try_decrypt_full(network, ufvk, pool, chunk, ciphertexts, memos, outgoing, hits) {
    const val8 = +chunk;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(pool, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray8ToWasm0(ciphertexts, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArray8ToWasm0(memos, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
        ptr5 = passArray8ToWasm0(outgoing, wasm.__wbindgen_malloc);
        len5 = WASM_VECTOR_LEN;
        ptr6 = passArray32ToWasm0(hits, wasm.__wbindgen_malloc);
        len6 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr6) { wasm.__wbindgen_free(ptr6, len6 * 4, 4); }
        if (ptr5) { wasm.__wbindgen_free(ptr5, len5 * 1, 1); }
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.try_decrypt_full(ptr0, len0, ptr1, len1, ptr2, len2, val8, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6);
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
 * @param {Uint8Array | number[]} body
 * @param {number} from
 * @param {Uint8Array | number[]} tried
 * @param {Uint32Array | number[]} secrets
 * @returns {any}
 */
export function try_decrypt_gpu(network, ufvk, pool, chunk, body, from, tried, secrets) {
    const val7 = +chunk;
    const val8 = +from;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passStringToWasm0(pool, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray8ToWasm0(body, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArray8ToWasm0(tried, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
        ptr5 = passArray32ToWasm0(secrets, wasm.__wbindgen_malloc);
        len5 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr5) { wasm.__wbindgen_free(ptr5, len5 * 4, 4); }
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.try_decrypt_gpu(ptr0, len0, ptr1, len1, ptr2, len2, val7, ptr3, len3, val8, ptr4, len4, ptr5, len5);
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
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passStringToWasm0(ufvk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
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
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_ff192a72a0dcdf6d: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_11da4b52cd0aedef: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64((arg0 >>> 0) + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_4f1baf9a00be3c74: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_f249a2a76caa9a55: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_3f58a9d3b3a7eed2: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_5fa10641e039d3ef: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_741ff2bb612836f5: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_8b968c3ab8e96595: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_undefined_be5b34249ff1fc15: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_38d7bfbe4cc84039: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_b2f214e2e4b30e36: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_934b640d0889af78: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64((arg0 >>> 0) + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_7ce8eee7fd327545: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_40b008ba32f73991: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_a410eb4b59ed5965: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_done_57e08d0be6e30c02: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_entries_7bb1459bd9b5c2b9: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_from_eac91875c8a5ffa4: function(arg0) {
            const ret = Array.from(arg0);
            return ret;
        },
        __wbg_getRandomValues_8b6f1f663e6f188d: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_get_635eea311fa1a291: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_d7176cfb76d71114: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_e6325ad374eff861: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_fc601247060b7204: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_12cdaa4161423e6b: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_d7aeb0dcb3108fea: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_bcf1376d0d732d08: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_1a35ba4d31e71d38: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_e4c5e8f68ada7b58: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_186163212ffe79c3: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_b03a0fabb109b1e9: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_13de428334042d26: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_37eb45aaf5eeb820: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_cd4348290afae586: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_next_178c1651c11432b3: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_af5ac6a08bb0a717: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_prototypesetcall_13162965d1fe7aa3: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_set_d2d33b52458e984a: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_e4b9a833d288759a: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_value_e0f328965e184931: function(arg0) {
            const ret = arg0.value;
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
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
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
    switch (typeof val) {
        // primitive types
        case 'number':
        case 'boolean':
        case 'undefined':
        return `${val}`;
        case 'string':
        return JSON.stringify(val);
        case 'bigint':
        return `${val}n`;
        case 'symbol':
        return val.description !== undefined
            ? `Symbol(${val.description})`
            : 'Symbol';
        case 'function':
        return typeof val.name === 'string' && val.name !== ''
            ? `Function(${val.name})`
            : 'Function';
        case 'object': {
            if (val === null) {
                return 'null';
            }
            // objects
            if (Array.isArray(val)) {
                return '[' + Array.from(val, debugString).join(', ') + ']';
            }
            // errors
            if (val instanceof Error) {
                return `${val.name}: ${val.message}\n${val.stack}`;
            }

            const toStringOutput = toString.call(val);
            // Test for built-in
            const className = /\[object ([^\]]+)\]/.exec(toStringOutput)?.[1];

            // Failed to match the standard '[object ClassName]'
            if (className === undefined) {
                return toStringOutput;
            }
            if (className === 'Object') {
                // we're a user defined class or Object
                // JSON.stringify avoids problems with cycles, and is generally much
                // easier than looping through ownProperties of `val`.
                try {
                    return 'Object(' + JSON.stringify(val) + ')';
                } catch (_) {
                    return 'Object';
                }
            }
            // TODO we could test for more things here, like `Set`s and `Map`s.
            return className;
        }
        // Per MDN: 'This list of values is exhaustive.'
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof#description
    }
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

let cachedBigUint64ArrayMemory0 = null;
function getBigUint64ArrayMemory0() {
    if (cachedBigUint64ArrayMemory0 === null || cachedBigUint64ArrayMemory0.byteLength === 0) {
        cachedBigUint64ArrayMemory0 = new BigUint64Array(wasm.memory.buffer);
    }
    return cachedBigUint64ArrayMemory0;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
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

function passArray64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getBigUint64ArrayMemory0().set(arg, ptr / 8);
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

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
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
    cachedBigUint64ArrayMemory0 = null;
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

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

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
