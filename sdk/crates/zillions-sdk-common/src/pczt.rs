use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

// Typed alias for `to_json()`'s return instead of `any`: costs nothing at runtime (still
// the same JsValue) and propagates to every wasm package that compiles `Pczt` (currently
// `@zillions-sdk/wallet` and `@zillions-sdk/keys`), since it's attached here rather than
// duplicated per-package.
//
// Best-effort: PCZT fields are redacted as it moves through its Creator -> ... -> Combiner
// lifecycle, so most fields below are optional with an index-signature fallback rather than
// enumerated exhaustively.
#[wasm_bindgen(typescript_custom_section)]
const PCZT_JSON_TYPES: &'static str = r#"
export interface PcztTransparentIoJson {
  value?: number;
  user_address?: string;
  [key: string]: unknown;
}

export interface PcztSaplingSpendJson {
  value?: number;
  [key: string]: unknown;
}

export interface PcztOrchardActionJson {
  spend?: { value?: number; [key: string]: unknown };
  output?: { value?: number; user_address?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface PcztJson {
  global?: {
    tx_version?: number;
    version_group_id?: number;
    consensus_branch_id?: number;
    fallback_lock_time?: number;
    expiry_height?: number;
    /** SLIP-44 coin type; use this to identify the target network, not a `network` field. */
    coin_type?: number;
    /** Bitfield: transparent inputs/outputs modifiable flags (see `pczt::common::Global`). */
    tx_modifiable?: number;
    proprietary?: Record<string, number[]>;
    [key: string]: unknown;
  };
  transparent?: {
    inputs?: PcztTransparentIoJson[];
    outputs?: PcztTransparentIoJson[];
    [key: string]: unknown;
  };
  sapling?: {
    spends?: PcztSaplingSpendJson[];
    outputs?: Record<string, unknown>[];
    /** Net Sapling value balance (spends - outputs); i128 has no safe `number` form. */
    value_sum?: bigint;
    [key: string]: unknown;
  };
  orchard?: {
    actions?: PcztOrchardActionJson[];
    value_sum?: [number, boolean];
    [key: string]: unknown;
  };
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "PcztJson")]
    pub type PcztJsonValue;
}

#[wasm_bindgen]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Pczt(pczt::Pczt);

impl From<pczt::Pczt> for Pczt {
    fn from(pczt: pczt::Pczt) -> Self {
        Self(pczt)
    }
}

impl From<Pczt> for pczt::Pczt {
    fn from(pczt: Pczt) -> Self {
        pczt.0
    }
}

#[wasm_bindgen]
impl Pczt {
    /// Returns a JSON object with the details of the Pczt. See `PcztJson` for the shape.
    pub fn to_json(&self) -> PcztJsonValue {
        serde_wasm_bindgen::to_value(&self)
            .unwrap()
            .unchecked_into()
    }

    /// Returns a Pczt from a JSON object
    pub fn from_json(s: JsValue) -> Pczt {
        serde_wasm_bindgen::from_value(s).unwrap()
    }

    /// Returns the postcard serialization of the Pczt.
    pub fn serialize(&self) -> Vec<u8> {
        self.0.serialize()
    }

    /// Deserialize to a Pczt from postcard bytes.
    pub fn from_bytes(bytes: &[u8]) -> Pczt {
        Self(pczt::Pczt::parse(bytes).unwrap())
    }

    /// Returns the transaction fee, in zatoshis, implied by this PCZT's bundle balances.
    ///
    /// Computed as transparent value in minus transparent value out, plus the net
    /// Sapling and Orchard value balances (each already spends-minus-outputs). This is
    /// the ZIP-317 fee that was applied when the PCZT was created, and does not change
    /// as the PCZT is signed, proved, or combined.
    pub fn fee(&self) -> u64 {
        let transparent = self.0.transparent();
        let transparent_in: i128 = transparent
            .inputs()
            .iter()
            .map(|input| *input.value() as i128)
            .sum();
        let transparent_out: i128 = transparent
            .outputs()
            .iter()
            .map(|output| *output.value() as i128)
            .sum();

        let sapling_value_sum: i128 = *self.0.sapling().value_sum();

        let (orchard_magnitude, orchard_is_negative) = *self.0.orchard().value_sum();
        let orchard_value_sum: i128 = if orchard_is_negative {
            -(orchard_magnitude as i128)
        } else {
            orchard_magnitude as i128
        };

        let fee = transparent_in - transparent_out + sapling_value_sum + orchard_value_sum;
        u64::try_from(fee).unwrap_or(0)
    }
}
