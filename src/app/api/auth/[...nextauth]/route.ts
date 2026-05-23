import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Connexion PPM 2026',
      credentials: {
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null;

        const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@2026';
        const userPassword = process.env.USER_PASSWORD || 'User@2026';

        // Admin password
        if (credentials.password === adminPassword) {
          return {
            id: '1',
            name: 'Administrateur',
            email: 'admin@ormvag.ma',
            role: 'admin' as const,
          };
        }

        // Observateur password
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
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
