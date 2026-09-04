import { createHash, randomBytes } from "crypto";

const INVITATION_LIFETIME_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns the expiry timestamp for a new invitation, seven days from now
 * @returns - ISO timestamp string for the expiry
 */
export function invitationExpiry(): string {
    return new Date(Date.now() + INVITATION_LIFETIME_MILLISECONDS).toISOString();
}

/**
 * Generates a random invitation token. Only its hash is ever stored.
 * @returns - 64 character hex token
 */
export function makeInvitationToken(): string {
    return randomBytes(32).toString("hex");
}

/**
 * Hashes an invitation token for storage and lookup
 * @param text - the plaintext token
 * @returns - SHA-256 hash of the token as hex
 */
export function hashToken(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

/**
 * Builds the invitation link for an email from the app url and token
 * @param token - the plaintext token to embed in the link
 * @returns - full invitation URL
 */
export function invitationLink(token: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
        throw new Error("NEXT_PUBLIC_APP_URL is not set, meaning invitation links can't be created correctly");
    }
    return baseUrl + "/invite/" + token;
}