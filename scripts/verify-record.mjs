import { readFileSync } from "fs";
import crypto from "crypto";

const path = process.argv[2];
if (!path) {
    console.error("Usage: node scripts/verify-record.mjs <record.json>");
    process.exit(1);
}
const doc = JSON.parse(readFileSync(path, "utf8"));
if (!doc.signature) {
    console.error("Record is unsigned.");
    process.exit(1);
}
const publicKey = crypto.createPublicKey({
    key: Buffer.from(doc.signature.public_key, "base64"),
    format: "der",
    type: "spki",
});
const recordBytes = Buffer.from(JSON.stringify(doc.record), "utf8");
const valid = crypto.verify(null, recordBytes, publicKey, Buffer.from(doc.signature.value, "base64"));
const fingerprint = crypto.createHash("sha256")
    .update(Buffer.from(doc.signature.public_key, "base64"))
    .digest("hex")
    .slice(0, 16);

console.log("Public key fingerprint: " + fingerprint);
if (valid) {
    console.log("SIGNATURE VALID: these record bytes were signed by the holder of this key.");
    console.log("Confirm the fingerprint with the platform out-of-band; a key inside the file proves nothing by itself.");
} else {
    console.error("SIGNATURE INVALID: the record was altered after signing, or signed by a different key.");
    process.exit(1);
}