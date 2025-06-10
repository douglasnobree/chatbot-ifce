import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: {
          label: 'email',
          type: 'text',
          placeholder: 'Enter your email',
        },
        password: {
          label: 'Password',
          type: 'password',
          placeholder: 'Enter your password',
        },
      },
      async authorize(credentials, req) {
        console.log('Credentials:', credentials);
        if (!credentials?.email || !credentials?.password) {
          throw new Error('email and password are required');
        }
        console.log('Attempting to log in with:', {
          email: credentials.email,
          password: credentials.password,
        });
        const { email, password } = credentials;
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          }
        );
        console.log('Response status:', res);
        if (res.status == 401) {
          return null;
        }
        const user = await res.json();
        if (res.ok && user) {
          return user;
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      console.log('JWT Callback:', { token, user });
      if (user) return { ...token, ...user };
      return token;
    },
    async session({ session, token }) {
      console.log('Session Callback:', { session, token });
      session.user = token.user || {};
      session.access_token = token.access_token || '';
      session.refresh_token = token.refresh_token || '';
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
