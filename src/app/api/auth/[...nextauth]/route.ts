import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Connexion ORMVAG PPM',
      credentials: {
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null;

        // Fail closed: no hard-coded/default credentials are permitted.
        // Configure these values only in Vercel Environment Variables.
        const adminPassword = process.env.ADMIN_PASSWORD;
        const userPassword = process.env.USER_PASSWORD;

        if (!adminPassword || !userPassword || !process.env.NEXTAUTH_SECRET) {
          console.error(
            'Authentication configuration incomplete: ADMIN_PASSWORD, USER_PASSWORD and NEXTAUTH_SECRET must be configured.'
          );
          return null;
        }

        if (credentials.password === adminPassword) {
          return {
            id: '1',
            name: 'Administrateur',
            email: 'admin@ormvag.ma',
            role: 'admin' as const,
          };
        }

        if (credentials.password === userPassword) {
          return {
            id: '2',
            name: 'Observateur',
            email: 'user@ormvag.ma',
            role: 'user' as const,
          };
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,
  },
  // NEXTAUTH_SECRET is mandatory in production; never substitute a public default.
  secret: process.env.NEXTAUTH_SECRET,
  ...(process.env.VERCEL_URL && !process.env.NEXTAUTH_URL
    ? { url: `https://${process.env.VERCEL_URL}` }
    : {}),
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
