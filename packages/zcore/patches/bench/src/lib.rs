use core::hint::black_box;
use ff::PrimeField;

#[inline(always)]
const fn mac_u128(a: u64, b: u64, c: u64, carry: u64) -> (u64, u64) {
    let ret = (a as u128) + ((b as u128) * (c as u128)) + (carry as u128);
    (ret as u64, (ret >> 64) as u64)
}

#[inline(always)]
const fn mac_split(a: u64, b: u64, c: u64, carry: u64) -> (u64, u64) {
    let (b_lo, b_hi) = (b & 0xffff_ffff, b >> 32);
    let (c_lo, c_hi) = (c & 0xffff_ffff, c >> 32);
    let (ll, lh, hl, hh) = (b_lo * c_lo, b_lo * c_hi, b_hi * c_lo, b_hi * c_hi);
    let mid = (ll >> 32) + (lh & 0xffff_ffff) + (hl & 0xffff_ffff);
    let lo = (ll & 0xffff_ffff) | (mid << 32);
    let hi = hh + (lh >> 32) + (hl >> 32) + (mid >> 32);
    let (lo, c1) = lo.overflowing_add(a);
    let (lo, c2) = lo.overflowing_add(carry);
    (lo, hi + c1 as u64 + c2 as u64)
}

fn mac_loop(n: u32, mac: impl Fn(u64, u64, u64, u64) -> (u64, u64)) -> u64 {
    let (mut x, mut y) = (
        black_box(0x9e37_79b9_7f4a_7c15),
        black_box(0xd1b5_4a32_d192_ed03),
    );
    for _ in 0..n {
        // Every input depends on the last result, so no product is hoisted out of the loop.
        let (lo, hi) = mac(x, x, y, y);
        (x, y) = (lo, hi ^ 0x9e37_79b9_7f4a_7c15);
    }
    x ^ y
}

fn mul_loop<F: PrimeField>(n: u32) -> u64 {
    let (mut x, y) = (
        black_box(F::from(0x9e37_79b9_7f4a_7c15)),
        black_box(F::from(0xd1b5_4a32_d192_ed03)),
    );
    for _ in 0..n {
        x *= y;
    }
    u64::from_le_bytes(x.to_repr().as_ref()[..8].try_into().unwrap())
}

#[no_mangle]
pub extern "C" fn mac_u128_loop(n: u32) -> u64 {
    mac_loop(n, mac_u128)
}

#[no_mangle]
pub extern "C" fn mac_split_loop(n: u32) -> u64 {
    mac_loop(n, mac_split)
}

#[no_mangle]
pub extern "C" fn fp_mul(n: u32) -> u64 {
    mul_loop::<pasta_curves::Fp>(n)
}

#[no_mangle]
pub extern "C" fn fq_mul(n: u32) -> u64 {
    mul_loop::<pasta_curves::Fq>(n)
}

#[no_mangle]
pub extern "C" fn scalar_mul(n: u32) -> u64 {
    mul_loop::<bls12_381::Scalar>(n)
}
