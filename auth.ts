import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import pool from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: {},
                password: {},
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                const result = pool.query(
                    "SELECT user_id, email, name, role, password_hash FROM users WHERE email = $1",
                    [credentials.email]
                );

                const user = (await result).rows[0];
                if (!user) return null;

                const valid = await bcrypt.compare(
                    credentials.password as string,
                    user.password_hash
                );
                if (!valid) return null;

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