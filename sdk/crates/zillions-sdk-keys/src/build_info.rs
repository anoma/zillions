use wasm_bindgen::prelude::*;

/// Returns the package name and git commit hash this WASM was built from.
/// Use this to verify the app and extension are running the same build.
///
/// Example: `"zillions-sdk-keys git=bf0769b"`
#[wasm_bindgen]
pub fn zillions_build_info() -> String {
    format!(
        "{} git={}",
        env!("CARGO_PKG_NAME"),
        env!("ZILLIONS_GIT_HASH")
    )
}
