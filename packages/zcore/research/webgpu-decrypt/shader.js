// WGSL Orchard key agreement: [k]P on Pallas for a batch of ephemeral keys P
// and two viewing keys k, the same GLV + width-4 wNAF ladder pasta_curves
// runs on the CPU. Field elements are 20 limbs of 13 bits in Montgomery form
// (R = 2^260), so a full row of limb products fits a u32 without carries.
// ponytail: incomplete Jacobian formulas (no P == Q or identity branches past
// the start), fine for timing random keys; production needs complete ones.

export const P = 0x40000000000000000000000000000000224698fc094cf91b992d30ed00000001n;
export const Q = 0x40000000000000000000000000000000224698fc0994a8dd8c46eb2100000001n;
const limbsLE = (u64s) => u64s.reduceRight((acc, l) => (acc << 64n) | l, 0n);
export const ZETA_P = limbsLE([0x1dad5ebdfdfe4ab9n, 0x1d1f8bd237ad3149n, 0x2caad5dc57aab1b0n, 0x12ccca834acdba71n]);
export const LAMBDA = limbsLE([0x2aa9d2e050aa0e4fn, 0x0fed467d47c033afn, 0x511db4d81cf70f5an, 0x06819a58283e528en]);

export const W = 13n;
export const NL = 20;
export const R = 1n << (W * BigInt(NL));
const mod = (a, m) => ((a % m) + m) % m;
export const toLimbs = (v) => Array.from({ length: NL }, (_, i) => Number((v >> (W * BigInt(i))) & 8191n));
export const fromLimbs = (l) => l.reduceRight((acc, x) => (acc << W) + BigInt(x), 0n);
export const pow = (b, e, m) => {
  let r = 1n;
  for (b = mod(b, m); e; e >>= 1n, b = (b * b) % m) if (e & 1n) r = (r * b) % m;
  return r;
};
export const toMont = (v) => toLimbs(mod(v * R, P));
export const RINV = pow(R, P - 2n, P);
export const fromMont = (l) => (fromLimbs(l) * RINV) % P;

// -p^-1 mod 2^13
const NP = Number(mod(-pow(P, (1n << 12n) - 1n, 1n << 13n), 1n << 13n));
const arr = (l) => `array<u32, 20>(${l.map((x) => `${x}u`).join(", ")})`;

export const WGSL = /* wgsl */ `
const MASK = 8191u;
const PM = ${arr(toLimbs(P))};
const NP = ${NP}u;
const ZETA = ${arr(toMont(ZETA_P))};
const DIGITS = 128u;

struct F { l: array<u32, 20> }
struct Pt { x: F, y: F, z: F }

@group(0) @binding(0) var<storage, read> points: array<u32>;
@group(0) @binding(1) var<storage, read> digits: array<i32>;
@group(0) @binding(2) var<storage, read_write> out: array<u32>;
@group(0) @binding(3) var<uniform> n: u32;

fn reduce(s: array<u32, 20>) -> F {
  // Value is below 2^260 and below 2p; one conditional subtract finishes it.
  var r: F;
  var b = 0u;
  for (var j = 0u; j < 20u; j++) {
    let d = s[j] - PM[j] - b;
    r.l[j] = d & MASK;
    b = (d >> 31u);
  }
  if (b == 1u) { r.l = s; }
  return r;
}

fn mul(a: F, b: F) -> F {
  var s: array<u32, 20>;
  for (var i = 0u; i < 20u; i++) {
    let ai = a.l[i];
    let t = s[0] + ai * b.l[0];
    let qi = (t * NP) & MASK;
    let c = (t + qi * PM[0]) >> 13u;
    s[0] = s[1] + ai * b.l[1] + qi * PM[1] + c;
    for (var j = 2u; j < 20u; j++) {
      s[j - 1u] = s[j] + ai * b.l[j] + qi * PM[j];
    }
    s[19] = 0u;
  }
  var c = 0u;
  for (var j = 0u; j < 19u; j++) {
    let v = s[j] + c;
    s[j] = v & MASK;
    c = v >> 13u;
  }
  s[19] += c;
  return reduce(s);
}

fn add(a: F, b: F) -> F {
  var s: array<u32, 20>;
  var c = 0u;
  for (var j = 0u; j < 20u; j++) {
    let v = a.l[j] + b.l[j] + c;
    s[j] = v & MASK;
    c = v >> 13u;
  }
  return reduce(s);
}

fn sub(a: F, b: F) -> F {
  var r: F;
  var bw = 0u;
  for (var j = 0u; j < 20u; j++) {
    let d = a.l[j] - b.l[j] - bw;
    r.l[j] = d & MASK;
    bw = d >> 31u;
  }
  if (bw == 1u) {
    var c = 0u;
    for (var j = 0u; j < 20u; j++) {
      let v = r.l[j] + PM[j] + c;
      r.l[j] = v & MASK;
      c = v >> 13u;
    }
  }
  return r;
}

fn neg(a: F) -> F { var z: F; return sub(z, a); }

// dbl-2009-l (a = 0): 2M + 5S.
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

// add-2007-bl: 11M + 5S.
fn padd(p: Pt, q: Pt) -> Pt {
  let z1z1 = mul(p.z, p.z);
  let z2z2 = mul(q.z, q.z);
  let u1 = mul(p.x, z2z2);
  let u2 = mul(q.x, z1z1);
  let s1 = mul(mul(p.y, q.z), z2z2);
  let s2 = mul(mul(q.y, p.z), z1z1);
  let h = sub(u2, u1);
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
  let idx = gid.x;
  if (idx >= n) { return; }
  var p: Pt;
  for (var j = 0u; j < 20u; j++) {
    p.x.l[j] = points[idx * 40u + j];
    p.y.l[j] = points[idx * 40u + 20u + j];
  }
  ${toMont(1n).map((x, j) => `p.z.l[${j}] = ${x}u;`).join(" ")}

  // {1, 3, 5, 7} * P, shared by both viewing keys.
  var tab: array<Pt, 4>;
  tab[0] = p;
  let p2 = dbl(p);
  for (var t = 1u; t < 4u; t++) { tab[t] = padd(tab[t - 1u], p2); }

  for (var k = 0u; k < 2u; k++) {
    var acc: Pt;
    var started = false;
    for (var ii = 0u; ii < DIGITS; ii++) {
      let i = DIGITS - 1u - ii;
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
    let o = (idx * 2u + k) * 60u;
    for (var j = 0u; j < 20u; j++) {
      out[o + j] = acc.x.l[j];
      out[o + 20u + j] = acc.y.l[j];
      out[o + 40u + j] = acc.z.l[j];
    }
  }
}
`;

export { mod };
