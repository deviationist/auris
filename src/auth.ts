import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getAuthCredentials } from "@/lib/auth-config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET || crypto.randomUUID(),
  providers: [
    Credentials({
      credentials: {
        username: {},
        password: {},
      },
      async authorize(credentials) {
        const creds = await getAuthCredentials();
        if (!creds) {
          console.error(
            "Auth credentials not configured. Set AUTH_USERNAME and AUTH_PASSWORD_HASH in /etc/default/auris, or run: npm run setup"
          );
          return null;
        }

        const username = credentials.username as string;
        const password = credentials.password as string;
        if (!username || !password) return null;

        if (username !== creds.username) return null;

        const valid = await bcrypt.compare(password, creds.passwordHash);
        if (!valid) return null;

        return { id: "1", name: creds.username };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth;
    },
  },
});
