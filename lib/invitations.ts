import { createHash, randomBytes } from "crypto"; 

const INVITATION_LIFETIME_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

export function invitationExpiry(): string {
    return new Date(Date.now() + INVITATION_LIFETIME_MILLISECONDS).toISOString();
}

 export function makeInvitationToken(): string {
    return randomBytes(32).toString("hex");
 }

 export function hashToken(text: string): string {
     return createHash("sha256").update(text).digest("hex");
 }