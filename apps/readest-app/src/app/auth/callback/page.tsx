'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { handleAuthCallback } from '@/helpers/auth';

export default function AuthCallback() {
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    // Appwrite OAuth redirects back after session creation.
    // The session is cookie-based, so we just finalize by reading it.
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const next = params.get('next') ?? '/library';

    handleAuthCallback({
      next,
      error,
      errorDescription,
      login,
      navigate: router.push,
    });
  }, [login, router]);

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      <span className='loading loading-infinity loading-xl w-20' />
    </div>
  );
}
