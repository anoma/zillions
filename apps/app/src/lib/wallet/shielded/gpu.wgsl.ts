/**
 * WGSL for trial decryption's key agreement: [ivk]·epk for every ephemeral
 * key of a chunk and both viewing keys (external, internal), one thread per
 * key. Pallas for Orchard and Ironwood; Jubjub, cofactor cleared, for Sapling.
 *
 * Field elements are 20 limbs of 13 bits in Montgomery form (R = 2^260): a
 * limb product is 26 bits, so a whole row of them sums in a u32 without
 * carries. Points come in, and secrets go out, as 8 canonical little-endian
 * words per coordinate.
 */

const W = 13n;
const LIMBS = 20;
const R = 1n << (W * BigInt(LIMBS));

export const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;
export const pow = (b: bigint, e: bigint, m: bigint) => {
  let r = 1n;
  for (b = mod(b, m); e; e >>= 1n, b = (b * b) % m) if (e & 1n) r = (r * b) % m;
  return r;
};
const limbs = (v: bigint) =>
  Array.from({ length: LIMBS }, (_, i) => (v >> (W * BigInt(i))) & 8191n);
const array = (v: bigint) =>
  `array<u32, 20>(${limbs(v)
    .map((x) => `${x}u`)
    .join(", ")})`;

/** Pallas's base field and group order. */
export const PALLAS_P =
  0x40000000000000000000000000000000224698fc094cf91b992d30ed00000001n;
export const PALLAS_Q =
  0x40000000000000000000000000000000224698fc0994a8dd8c46eb2100000001n;
/** pasta_curves' `Fp::ZETA`: φ(x, y) = (ζx, y) is [λ] with λ = `Fq::ZETA`. */
const ZETA =
  0x12ccca834acdba712caad5dc57aab1b01d1f8bd237ad31491dad5ebdfdfe4ab9n;
/** Jubjub's base field, BLS12-381's scalar field. */
export const JUBJUB_P =
  0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;

const J = Array.from({ length: LIMBS }, (_, j) => j);
const lines = (f: (j: number) => string, js = J) => js.map(f).join("\n  ");

/**
 * Montgomery arithmetic mod `p`, and loading and storing canonical words.
 * Every loop is unrolled and every index a constant: Firefox's shader
 * compiler runs the looped form many times slower. Products with a zero limb
 * of `p` (most of Pallas's middle ones) are left out.
 */
function field(p: bigint) {
  const pm = limbs(p);
  // -p^-1 mod 2^13; the unit group mod 2^13 has order 2^12.
  const np = mod(-pow(p, (1n << 12n) - 1n, 1n << 13n), 1n << 13n);
  const qp = (j: number) =>
    pm[j] === 0n ? "" : pm[j] === 1n ? " + q" : ` + q * ${pm[j]}u`;
  // Limb i's [word, bit offset] among the 8 canonical words.
  const word = (i: number) => [Math.floor((13 * i) / 32), (13 * i) % 32];
  return /* wgsl */ `
const MASK = 8191u;
const R2 = ${array((R * R) % p)};

struct F { l: array<u32, 20> }

// Value below 2^260 and 2p: one conditional subtract finishes it.
fn reduce(a: F) -> F {
  var r: F;
  var b = 0u;
  var d = 0u;
  ${lines((j) => `d = a.l[${j}] - ${pm[j]}u - b; r.l[${j}] = d & MASK; b = d >> 31u;`)}
  if (b == 1u) { return a; }
  return r;
}

fn mul(a: F, b: F) -> F {
  ${lines((j) => `var s${j} = 0u;`, J.slice(0, 19))}
  var ai = 0u;
  var t = 0u;
  var q = 0u;
  ${J.map(
    (i) => `ai = a.l[${i}];
  t = s0 + ai * b.l[0];
  q = (t * ${np}u) & MASK;
  s0 = s1 + ai * b.l[1]${qp(1)} + ((t${qp(0)}) >> 13u);
  ${lines((j) => `s${j - 1} = s${j} + ai * b.l[${j}]${qp(j)};`, J.slice(2, 19))}
  s18 = ai * b.l[19]${qp(19)};`,
  ).join("\n  ")}
  var r: F;
  var c = 0u;
  ${lines((j) => `c += s${j}; r.l[${j}] = c & MASK; c >>= 13u;`, J.slice(0, 19))}
  r.l[19] = c;
  return reduce(r);
}

fn add(a: F, b: F) -> F {
  var r: F;
  var c = 0u;
  ${lines((j) => `c += a.l[${j}] + b.l[${j}]; r.l[${j}] = c & MASK; c >>= 13u;`)}
  return reduce(r);
}

fn sub(a: F, b: F) -> F {
  var r: F;
  var bw = 0u;
  var d = 0u;
  ${lines((j) => `d = a.l[${j}] - b.l[${j}] - bw; r.l[${j}] = d & MASK; bw = d >> 31u;`)}
  if (bw == 0u) { return r; }
  var c = 0u;
  ${lines((j) => `c += r.l[${j}] + ${pm[j]}u; r.l[${j}] = c & MASK; c >>= 13u;`)}
  return r;
}

fn neg(a: F) -> F { var z: F; return sub(z, a); }

fn is_zero(a: F) -> bool {
  return (${J.map((j) => `a.l[${j}]`).join(" | ")}) == 0u;
}

// 8 canonical words at points[at], into Montgomery form.
fn load(at: u32) -> F {
  var a: F;
  ${lines((i) => {
    const [w, off] = word(i);
    const hi =
      off > 19 && w < 7 ? ` | (points[at + ${w + 1}u] << ${32 - off}u)` : "";
    return `a.l[${i}] = ((points[at + ${w}u] >> ${off}u)${hi}) & MASK;`;
  })}
  return mul(a, F(R2));
}

// Out of Montgomery form, as 8 canonical words at out[at].
fn store(at: u32, a: F) {
  var one: F;
  one.l[0] = 1u;
  let c = mul(a, one);
  ${Array.from({ length: 8 }, (_, k) => {
    const parts = J.flatMap((i) => {
      const [w, off] = word(i);
      if (w === k) return [`(c.l[${i}] << ${off}u)`];
      if (w + 1 === k && off > 19) return [`(c.l[${i}] >> ${32 - off}u)`];
      return [];
    });
    return `out[at + ${k}u] = ${parts.join(" | ")};`;
  }).join("\n  ")}
}
`;
}

const bindings = /* wgsl */ `
@group(0) @binding(0) var<storage, read> points: array<u32>;
@group(0) @binding(1) var<storage, read> digits: array<i32>;
@group(0) @binding(2) var<storage, read_write> out: array<u32>;
// One slice of the chunk per dispatch: outputs base.. of n.
struct Range { n: u32, base: u32 }
@group(0) @binding(3) var<uniform> range: Range;
`;

/**
 * Pallas: pasta_curves' own algorithm, a GLV split with a width-4 wNAF ladder
 * over {1,3,5,7}·P and φ applied on the fly. `digits` holds, per ivk, 128 for
 * each half. Jacobian formulas (dbl-2009-l, add-2007-bl) are incomplete, so
 * an addition of equal or opposite points flags its output for the CPU.
 */
export const PALLAS = /* wgsl */ `
${bindings}
${field(PALLAS_P)}
const ZETA = ${array(mod(ZETA * R, PALLAS_P))};
const ONE = ${array(R % PALLAS_P)};

struct Pt { x: F, y: F, z: F }

var<private> exceptional: bool;

fn dbl(p: Pt) -> Pt {
  let a = mul(p.x, p.x);
  let b = mul(p.y, p.y);
  let c = mul(b, b);
  let xb = add(p.x, b);
  var d = sub(sub(mul(xb, xb), a), c);
  d = add(d, d);
  let e = add(add(a, a), a);
  let f = mul(e, e);
  var r: Pt;
  r.x = sub(f, add(d, d));
  var c8 = add(c, c); c8 = add(c8, c8); c8 = add(c8, c8);
  r.y = sub(mul(e, sub(d, r.x)), c8);
  let yz = mul(p.y, p.z);
  r.z = add(yz, yz);
  return r;
}

fn padd(p: Pt, q: Pt) -> Pt {
  let z1z1 = mul(p.z, p.z);
  let z2z2 = mul(q.z, q.z);
  let u1 = mul(p.x, z2z2);
  let u2 = mul(q.x, z1z1);
  let s1 = mul(mul(p.y, q.z), z2z2);
  let s2 = mul(mul(q.y, p.z), z1z1);
  let h = sub(u2, u1);
  if (is_zero(h)) { exceptional = true; }
  let h2 = add(h, h);
  let i = mul(h2, h2);
  let j = mul(h, i);
  var rr = sub(s2, s1);
  rr = add(rr, rr);
  let v = mul(u1, i);
  var r: Pt;
  r.x = sub(sub(mul(rr, rr), j), add(v, v));
  let s1j = mul(s1, j);
  r.y = sub(mul(rr, sub(v, r.x)), add(s1j, s1j));
  let zz = add(p.z, q.z);
  r.z = mul(sub(sub(mul(zz, zz), z1z1), z2z2), h);
  return r;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x + range.base;
  if (idx >= range.n) { return; }
  let p = Pt(load(idx * 16u), load(idx * 16u + 8u), F(ONE));

  var tab: array<Pt, 4>;
  tab[0] = p;
  let p2 = dbl(p);
  for (var t = 1u; t < 4u; t++) { tab[t] = padd(tab[t - 1u], p2); }
  let base = exceptional;

  for (var k = 0u; k < 2u; k++) {
    exceptional = base;
    var acc: Pt;
    var started = false;
    for (var ii = 0u; ii < 128u; ii++) {
      let i = 127u - ii;
      if (started) { acc = dbl(acc); }
      for (var half = 0u; half < 2u; half++) {
        let d = digits[k * 256u + half * 128u + i];
        if (d != 0) {
          var e = tab[u32(abs(d)) / 2u];
          if (half == 1u) { e.x = mul(e.x, F(ZETA)); }
          if (d < 0) { e.y = neg(e.y); }
          if (started) { acc = padd(acc, e); } else { acc = e; started = true; }
        }
      }
    }
    let o = (idx * 2u + k) * 25u;
    store(o, acc.x);
    store(o + 8u, acc.y);
    store(o + 16u, acc.z);
    out[o + 24u] = select(0u, 1u, exceptional || !started);
  }
}
`;

/** Jubjub's d = -(10240/10241), and the 2d its addition law takes. */
const D = mod(-10240n * pow(10241n, JUBJUB_P - 2n, JUBJUB_P), JUBJUB_P);

/**
 * Jubjub (-u² + v² = 1 + d·u²·v²): a width-4 wNAF ladder over {1,3,5,7}·P in
 * extended coordinates, 256 digits per ivk, then [8] to clear the cofactor as
 * Sapling's key agreement does. With a = -1 a square and d not one, the
 * unified addition (add-2008-hwcd-3) is complete, so nothing is flagged.
 */
export const JUBJUB = /* wgsl */ `
${bindings}
${field(JUBJUB_P)}
const K = ${array(mod(2n * D * R, JUBJUB_P))};
const ONE = ${array(R % JUBJUB_P)};

struct E { x: F, y: F, z: F, t: F }

fn eadd(p: E, q: E) -> E {
  let a = mul(sub(p.y, p.x), sub(q.y, q.x));
  let b = mul(add(p.y, p.x), add(q.y, q.x));
  let c = mul(mul(p.t, F(K)), q.t);
  let zz = mul(p.z, q.z);
  let d = add(zz, zz);
  let e = sub(b, a);
  let f = sub(d, c);
  let g = add(d, c);
  let h = add(b, a);
  return E(mul(e, f), mul(g, h), mul(f, g), mul(e, h));
}

fn edbl(p: E) -> E {
  let a = mul(p.x, p.x);
  let b = mul(p.y, p.y);
  let zz = mul(p.z, p.z);
  let c = add(zz, zz);
  let d = neg(a);
  let xy = add(p.x, p.y);
  let e = sub(sub(mul(xy, xy), a), b);
  let g = add(d, b);
  let f = sub(g, c);
  let h = sub(d, b);
  return E(mul(e, f), mul(g, h), mul(f, g), mul(e, h));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x + range.base;
  if (idx >= range.n) { return; }
  let u = load(idx * 16u);
  let v = load(idx * 16u + 8u);
  let p = E(u, v, F(ONE), mul(u, v));

  var tab: array<E, 4>;
  tab[0] = p;
  let p2 = edbl(p);
  for (var t = 1u; t < 4u; t++) { tab[t] = eadd(tab[t - 1u], p2); }

  for (var k = 0u; k < 2u; k++) {
    var zero: F;
    var acc = E(zero, F(ONE), F(ONE), zero);
    var started = false;
    for (var ii = 0u; ii < 256u; ii++) {
      let i = 255u - ii;
      if (started) { acc = edbl(acc); }
      let d = digits[k * 256u + i];
      if (d != 0) {
        var e = tab[u32(abs(d)) / 2u];
        if (d < 0) { e.x = neg(e.x); e.t = neg(e.t); }
        if (started) { acc = eadd(acc, e); } else { acc = e; started = true; }
      }
    }
    acc = edbl(edbl(edbl(acc)));
    let o = (idx * 2u + k) * 25u;
    store(o, acc.x);
    store(o + 8u, acc.y);
    store(o + 16u, acc.z);
    out[o + 24u] = 0u;
  }
}
`;
