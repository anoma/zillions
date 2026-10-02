//! A mainnet unified address's Sapling receiver as a `zs1…` address, to pay
//! Sapling funds into the wallet for testing: the wallet itself puts new
//! shielded value in Ironwood.
//!
//! cargo run --example sapling_receiver -- <unified address>

use zcash_keys::address::Address;
use zcash_protocol::consensus::MainNetwork;

fn main() {
    let arg = std::env::args()
        .nth(1)
        .expect("usage: sapling_receiver <unified address>");
    let Some(Address::Unified(ua)) = Address::decode(&MainNetwork, &arg) else {
        panic!("not a mainnet unified address");
    };
    let sapling = ua.sapling().expect("this address has no Sapling receiver");
    println!("{}", Address::Sapling(*sapling).encode(&MainNetwork));
}
