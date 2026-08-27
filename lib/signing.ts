import crypto from "crypto";

const PRIVATE_KEY_BASE64 = process.env.RECORD_SIGNING_KEY;
const PUBLIC_KEY_BASE64 = process.env.RECORD_SIGNING_PUBLIC_KEY;

export type RecordSignature = {
    algorithm: "Ed25519";
    public_key: string;
    value: string;
    note: string;
};

/**
 * Signs the exact JSON bytes of an exported record.
 */
export function signRecord(recordJson: string): RecordSignature | null {
    if (!PRIVATE_KEY_BASE64 || !PUBLIC_KEY_BASE64) {
        return null;
    }
    const privateKey = crypto.createPrivateKey({
        key: Buffer.from(PRIVATE_KEY_BASE64, "base64"),
        format: "der",
        type: "pkcs8",
    });
    const signatureBytes = crypto.sign(null, Buffer.from(recordJson, "utf8"), privateKey);
    return {
        algorithm: "Ed25519",
        public_key: PUBLIC_KEY_BASE64,
        value: signatureBytes.toString("base64"),
        note: "Signature covers the exact JSON bytes of the record field. Verify with scripts/verify-record.mjs. Trust in the public key must be established with the platform directly, not taken from this file.",
    };
}