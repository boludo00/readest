import { type AppwriteUser } from '@/context/AuthContext';

interface UseAuthCallbackOptions {
  login: (accessToken: string, user: AppwriteUser) => void;
  navigate: (path: string) => void;
  next?: string;
  error?: string | null;
  errorDescription?: string | null;
}

export function handleAuthCallback({
  login,
  navigate,
  next = '/',
  error,
  errorDescription,
}: UseAuthCallbackOptions) {
  async function finalizeSession() {
    if (error) {
      console.error('Auth callback error:', error, errorDescription);
      navigate('/auth/error');
      return;
    }

    try {
      // Appwrite OAuth sessions are automatically established via cookies
      // after the redirect — we just need to read the current session.
      const { Account } = await import('appwrite');
      const { appwriteClient } = await import('@/utils/appwrite');
      const account = new Account(appwriteClient);

      const user = await account.get();
      const jwtResponse = await account.createJWT();

      login(jwtResponse.jwt, user);
      navigate(next);
    } catch (err) {
      console.error('Error finalizing Appwrite session:', err);
      navigate('/auth/error');
    }
  }

  finalizeSession();
}
