import crypto from "crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const PRIV_B64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const PUB_B64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

describe("signRecord", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    test("signature verifies against the exact signed bytes", async () => {
        vi.stubEnv("RECORD_SIGNING_KEY", PRIV_B64);
        vi.stubEnv("RECORD_SIGNING_PUBLIC_KEY", PUB_B64);
        const { signRecord } = await import("./signing");

        const recordJson = JSON.stringify({ property_id: 7, events: [] });
        const signature = signRecord(recordJson);
        expect(signature).not.toBeNull();

        const valid = crypto.verify(
            null,
            Buffer.from(recordJson, "utf8"),
            crypto.createPublicKey({ key: Buffer.from(signature!.public_key, "base64"), format: "der", type: "spki" }),
            Buffer.from(signature!.value, "base64")
        );
        expect(valid).toBe(true);
    });

    test("verification fails if a single byte of the record changes", async () => {
        vi.stubEnv("RECORD_SIGNING_KEY", PRIV_B64);
        vi.stubEnv("RECORD_SIGNING_PUBLIC_KEY", PUB_B64);
        const { signRecord } = await import("./signing");

        const recordJson = JSON.stringify({ property_id: 7, amount: 250000 });
        const signature = signRecord(recordJson)!;
        const tampered = recordJson.replace("250000", "260000");

        const valid = crypto.verify(
            null,
            Buffer.from(tampered, "utf8"),
            crypto.createPublicKey({ key: Buffer.from(signature.public_key, "base64"), format: "der", type: "spki" }),
            Buffer.from(signature.value, "base64")
        );
        expect(valid).toBe(false);
    });

    test("returns null when signing keys are not configured", async () => {
        vi.stubEnv("RECORD_SIGNING_KEY", "");
        vi.stubEnv("RECORD_SIGNING_PUBLIC_KEY", "");
        const { signRecord } = await import("./signing");
        expect(signRecord("{}")).toBeNull();
    });
});