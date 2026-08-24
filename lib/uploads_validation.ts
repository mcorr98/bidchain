/**
 * Validates that a file's leading bytes match its alleged type
 */
export function matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
    if (mimeType === "image/jpeg") {
        return buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
    }
    if (mimeType === "image/png") {
        return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimeType === "image/webp") {
        return buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    }
    if (mimeType === "application/pdf") {
        return buffer.length > 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    }
    return false;
}
