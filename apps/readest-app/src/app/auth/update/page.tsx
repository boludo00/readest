'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { appwriteAccount } from '@/utils/appwrite';

export default function UpdateEmailPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      router.push('/auth');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await appwriteAccount.updateEmail(email, password);

      setMessage(_('Your email has been updated successfully.'));
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : _('Failed to update email'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-md p-8'>
        <div className='rounded-md p-8'>
          <form onSubmit={handleSubmit} className='space-y-6'>
            <div className='space-y-1'>
              <label htmlFor='email' className='text-base-content/60 block text-sm font-normal'>
                {_('New Email')}
              </label>
              <input
                id='email'
                type='email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={_('Your new email')}
                required
                disabled={loading}
                className='border-base-300 bg-base-100 text-base-content w-full rounded-md border px-4 py-2.5 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50'
              />
            </div>

            <div className='space-y-1'>
              <label htmlFor='password' className='text-base-content/60 block text-sm font-normal'>
                {_('Current Password')}
              </label>
              <input
                id='password'
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={_('Your current password')}
                required
                disabled={loading}
                className='border-base-300 bg-base-100 text-base-content w-full rounded-md border px-4 py-2.5 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50'
              />
            </div>

            {error && <div className='text-sm text-red-500'>{error}</div>}

            {message && <div className='text-base-content text-sm'>{message}</div>}

            <button
              type='submit'
              disabled={loading || !email || !password}
              className='w-full rounded-md bg-green-400 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed'
            >
              {loading ? _('Updating email ...') : _('Update email')}
            </button>

            <button
              type='button'
              onClick={() => router.back()}
              className='border-base-300 text-base-content/70 hover:bg-base-200 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm transition-colors'
            >
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='h-4 w-4'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M15 19l-7-7 7-7'
                />
              </svg>
              {_('Back')}
            </button>
          </form>

          {user?.email && (
            <div className='text-base-content/50 mt-6 text-center text-sm'>
              {_('Current email')}: {user.email}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
