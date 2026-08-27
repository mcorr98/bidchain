import crypto from "crypto";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");

console.log("Add these lines to .env (the private key must never be committed):");
console.log("");
console.log("RECORD_SIGNING_KEY=" + priv);
console.log("RECORD_SIGNING_PUBLIC_KEY=" + pub);