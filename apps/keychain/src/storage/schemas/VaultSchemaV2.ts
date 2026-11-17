import * as t from "io-ts";

const Uint8ArrayCodec = new t.Type<Uint8Array, Uint8Array, unknown>(
  "Uint8Array",
  (u): u is Uint8Array => u instanceof Uint8Array,
  (u, c) => {
    try {
      const a = Array.from(u as Uint8Array);
      return t.success(Uint8Array.from(a));
    } catch {
      return t.failure(u, c);
    }
  },
  t.identity
);

enum KdfType {
  Argon2 = "argon2",
  Scrypt = "scrypt",
}

export const Sensitive = t.type({
  cipher: t.type({
    type: t.literal("aes-256-gcm"),
    iv: Uint8ArrayCodec,
    text: Uint8ArrayCodec,
  }),
  kdf: t.type({
    type: t.keyof({
      [KdfType.Argon2]: null,
      [KdfType.Scrypt]: null,
    }),
    params: t.any,
  }),
});

enum AccountType {
  Mnemonic = "mnemonic",
  PrivateKey = "private-key",
  ShieldedKeys = "shielded-keys",
  Ledger = "ledger",
  ViewingKey = "viewing-key",
  Disposable = "disposable",
}

export const KeyStore = t.exact(
  t.intersection([
    t.type({
      id: t.string,
      alias: t.string,
      address: t.string,
      owner: t.string,
      path: t.intersection([
        t.type({
          account: t.number,
        }),
        t.partial({
          change: t.number,
          index: t.number,
        }),
      ]),
      type: t.keyof({
        [AccountType.Mnemonic]: null,
        [AccountType.PrivateKey]: null,
        [AccountType.ShieldedKeys]: null,
        [AccountType.Ledger]: null,
        [AccountType.ViewingKey]: null,
        [AccountType.Disposable]: null,
      }),
      source: t.keyof({
        imported: null,
        generated: null,
      }),
      timestamp: t.number,
    }),
    t.type({
      /** ZIP-32 seed fingerprint (hex). Random for accounts with no seed here
       * (Ledger, private-key/spending-key imports); older ones held zeros or
       * "" until `replacePlaceholderFingerprints`. */
      seedFingerprint: t.string,
      /** Block height this account was created/imported at. Used by the app
       * wallet to skip scanning earlier blocks. */
      birthday: t.number,
    }),
    t.partial({
      modifiedZip32Path: t.string,
      parentId: t.string,
      pseudoExtendedKey: t.string,
      diversifierIndex: t.number,
      /** The hardware wallet the keys live on, if any. */
      device: t.string,
      /** A passkey's WebAuthn credential: id (base64url), rpId, and COSE
       * public key (base64) when the credential was created here — an
       * imported one carries no public key, WebAuthn never re-reveals
       * one. Not a secret. */
      credential: t.intersection([
        t.type({
          id: t.string,
          rpId: t.string,
        }),
        t.partial({
          publicKey: t.string,
        }),
      ]),
    }),
  ])
);

export const Vault = t.intersection([
  t.type({
    data: t.record(
      t.string,
      t.array(
        t.intersection([
          t.type({
            public: KeyStore,
          }),
          t.partial({
            sensitive: Sensitive,
          }),
        ])
      )
    ),
  }),
  t.partial({
    password: Sensitive,
  }),
]);
