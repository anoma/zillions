/**
 * Pinned against the `crypto_bg.wasm` this replaced: existing vaults must keep
 * opening and phrases must keep giving the same seeds.
 */
import { readFileSync } from "node:fs";
import { initSync } from "@zillions/zcore";
import { describe, expect, it, vi } from "vitest";

import { decrypt, encrypt, KdfType } from "./crypto";

vi.mock("webextension-polyfill", () => ({
  default: { runtime: { getURL: (path: string) => path } },
}));

// Loaded here, so `initZillionsSdk` finds it ready instead of fetching it.
initSync({
  module: readFileSync(
    new URL("../../../../../packages/zcore/pkg/zcore_bg.wasm", import.meta.url),
  ),
});
import { mnemonicToSeed, validateMnemonic } from "./mnemonic";

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
const unhex = (text: string): Uint8Array =>
  new Uint8Array(Buffer.from(text, "hex"));

// sha256("password"), the vault's password hash.
const PASSWORD =
  "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";

const OLD_RECORD = {
  cipher: {
    type: "aes-256-gcm" as const,
    iv: unhex("c1b2e6fba6b5db215b0da49a"),
    text: unhex(
      "fac3a72bad47e265cad4d0fc3f8abae6d07e86a11d15597f165a5daee6a4ac26" +
        "825a597e8e03cdca61213a328031d39882ae98efd70c85ff45d524a8",
    ),
  },
  kdf: {
    type: KdfType.Argon2,
    params: {
      m_cost: 65536,
      t_cost: 3,
      p_cost: 1,
      salt: "dHcuDRg4VRSUESfL8lSrKA",
    },
  },
};

const M12 = `${"abandon ".repeat(11)}about`;
const M24 = `${"zoo ".repeat(23)}vote`;

describe("vault crypto", () => {
  it("opens a record the old wasm wrote", async () => {
    expect(await decrypt(OLD_RECORD, PASSWORD)).toBe(
      '{"text":"abandon ability","passphrase":"ü"}',
    );
  });

  it("rejects the wrong password", async () => {
    await expect(decrypt(OLD_RECORD, `${PASSWORD}0`)).rejects.toThrow();
  });

  it("round-trips in the old record shape", async () => {
    const record = await encrypt("secret", PASSWORD);
    expect(record.cipher.iv).toHaveLength(12);
    expect(record.kdf.params).toMatchObject({
      m_cost: 65536,
      t_cost: 3,
      p_cost: 1,
    });
    expect(record.kdf.params.salt).toMatch(/^[A-Za-z0-9+/]{22}$/);
    expect(await decrypt(record, PASSWORD)).toBe("secret");
  });
});

describe("mnemonic", () => {
  it.each([
    [
      M12,
      "",
      "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4",
    ],
    [
      M12,
      "TREZOR",
      "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
    ],
    [
      M24,
      "TREZOR",
      "dd48c104698c30cfe2b6142103248622fb7bb0ff692eebb00089b32d22484e1613912f0a5b694407be899ffd31ed3992c456cdf60f5d4564b8ba3f05a69890ad",
    ],
    [
      M12,
      "ünïcödé",
      "c7bcd79d8260e2aa08481cf25a94bf863fc6f39a47f1fb5c1faaa46ff1fbec17df56d1a009b0a116b20dad90893c3e0d42ef75af037bcbb36424836eddb5af5e",
    ],
    [
      M12,
      "ü",
      "014b76e8bd6869d5ea777179a6a07d2489d9278aa4d81b6f6257d681d9474436978a308d64bc732220aefdf20e91b1c8b79979116d2398402d41e341fc036434",
    ],
  ])("gives the old seed for %s / %s", async (phrase, passphrase, seed) => {
    expect(hex(await mnemonicToSeed(phrase, passphrase))).toBe(seed);
  });

  it.each([
    [M12, true],
    [M24, true],
    [`${"abandon ".repeat(11)}abandon`, false],
    [M12.toUpperCase(), false],
    [` ${M12}`, false],
    [M12.replace(/ /g, "  "), false],
    [`${"abandon ".repeat(10)}abandon`, false],
  ])("validates %j as %s, as the old wasm did", async (phrase, valid) => {
    expect(await validateMnemonic(phrase)).toBe(valid);
  });

  it("refuses a seed for an invalid phrase", async () => {
    await expect(mnemonicToSeed(M12.toUpperCase())).rejects.toThrow();
  });
});
