const bip39 = require("bip39");
const { derivePath } = require("ed25519-hd-key");
const { Keypair } = require("@solana/web3.js");

const TARGET = "27iNJT6mni2fRuu1knivYgYHcAhicwW6WjXTZqffQBAG";

const MNEMONIC = process.env.PHANTOM_SEED;
if (!MNEMONIC) {
  console.log("Missing PHANTOM_SEED env var");
  console.log('Run: $env:PHANTOM_SEED="word word ..."; node scripts/find-phantom-account.js');
  process.exit(1);
}

(async () => {
  const seed = await bip39.mnemonicToSeed(MNEMONIC);

  // Phantom standard: m/44'/501'/{account}'/0'
  for (let account = 0; account < 200; account++) {
    const path = `m/44'/501'/${account}'/0'`;
    const derived = derivePath(path, seed.toString("hex")).key; // 32 bytes
    const kp = Keypair.fromSeed(derived);
    const pub = kp.publicKey.toBase58();

    if (account % 10 === 0) console.log("…scanning", account);

    if (pub === TARGET) {
      console.log("\n✅ FOUND 27iN!");
      console.log("account index:", account);
      console.log("path:", path);
      console.log("pubkey:", pub);
      console.log("secretKey JSON:", JSON.stringify(Array.from(kp.secretKey)));
      process.exit(0);
    }
  }

  console.log("\n❌ Not found in first 200 accounts.");
  console.log("If you used multiple wallets in Phantom, it might be a different seed phrase.");
  process.exit(2);
})();
