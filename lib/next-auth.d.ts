import NextAuth from 'next-auth';
import JWT from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    access_token: string;
    refresh_token: string;
    user: {
      id: string;
      email: string;
      name: string;
      role: 'ADMIN' | 'AVALIADOR' | 'PROPRIETARIO';
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    access_token: string;
    refresh_token: string;
    user: {
      id: string;
      email: string;
      name: string;
      role: 'ADMIN' | 'AVALIADOR' | 'PROPRIETARIO';
      image?: string | null;
    };
  }
}
