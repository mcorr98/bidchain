import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import pool from "@/lib/db";
import { standardiseEmail } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";

const DUMMY_HASH = "$2b$12$lETKQ9rkPE00H112daYjGuZYh2M0Ts8d/AuDjXhN8Oj50SP4/sA.e"

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: {},
                password: {},
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                if (!rateLimit("login:" + standardiseEmail(String(credentials.email)), 5, 15 * 60 * 1000)) {
                    return null;
                }

                const result = pool.query(
                    `SELECT user_id, email, name, role, password_hash FROM users WHERE email = $1`,
                    [standardiseEmail(String(credentials.email))]
                );

                const user = (await result).rows[0];
                if (!user) {
                    await bcrypt.compare(credentials.password as string, DUMMY_HASH);
                    return null;
                }

                const valid = await bcrypt.compare(
                    credentials.password as string,
                    user.password_hash
                );
                if (!valid) {
                    return null;
                }

                return {
                    id: String(user.user_id),
                    email: user.email,
                    name: user.name,
                    role: user.role,
                };
            },
        }),
    ],
    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = user.role;
            }
            return token;
        },
        session({ session, token }) {
            session.user.id = token.id as string;
            session.user.role = token.role as string;
            return session;
        },
    },
}); 