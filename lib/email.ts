import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? "1025"),
    secure: false,
});

/**
 * Sends a single plain-text email
 * @param to - recipient address
 * @param subject - subject line
 * @param text - plain-text body
 * @returns true if the transport accepted the message, false otherwise
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM ?? "BidChain <noreply@bidchain.test>",
            to,
            subject,
            text,
        });
        return true;
    } catch (err) {
        console.error("sendEmail failed:", err);
        return false;
    }
}

/**
 * Invitation email for a bidder invited to a property's bidding process
 */
export async function sendBidderInviteEmail(to: string, propertyAddress: string, link: string): Promise<boolean> {
    const subject = "You're invited to bid on " + propertyAddress;
    const text = [
        "You have been invited to participate in bidding on " + propertyAddress + ".",
        "",
        "Create your account (or sign in) using this link:",
        link,
        "",
        "(This link is single use, and expires in 7 days)",
    ].join("\n");
    return sendEmail(to, subject, text);
}

/**
 * Activation email for a vendor invited by their estate agency
 */
export async function sendVendorActivationEmail(to: string, propertyAddress: string, link: string): Promise<boolean> {
    const subject = "Your BidChain vendor account";
    const text = [
        "Your estate agent has invited you to join your property on BidChain.",
        "",
        "Create your account (or sign in) using this link:",
        link,
    ].join("\n");
    return sendEmail(to, subject, text);
}

/**
 * Emails a bidder their signed chain receipt after a bid. Fail-soft like
 * every sender here: a dead mail server must never affect a committed bid.
 */
export async function sendBidReceiptEmail(to: string, propertyAddress: string, receiptJson: string, filename: string): Promise<boolean> {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM ?? "BidChain <noreply@bidchain.test>",
            to,
            subject: "Your bid receipt for " + propertyAddress,
            text: [
                "Your bid on " + propertyAddress + " has been recorded.",
                "",
                "Attached is your signed chain receipt. Keep it - it commits to the",
                "full history of bidding at the moment your bid was recorded, and can",
                "be used later to verify that the record has not been altered.",
            ].join("\n"),
            attachments: [
                { filename: filename, content: receiptJson, contentType: "application/json" },
            ],
        });
        return true;
    } catch (err) {
        console.error("sendBidReceiptEmail failed:", err);
        return false;
    }
}