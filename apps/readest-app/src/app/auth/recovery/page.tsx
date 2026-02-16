'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { appwriteAccount } from '@/utils/appwrite';

export default function ResetPasswordPage() {
  const _ = useTranslation();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    if (password !== confirmPassword) {
      setError(_('Passwords do not match'));
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const userId = params.get('userId');
      const secret = params.get('secret');

      if (!userId || !secret) {
        setError(_('Invalid recovery link'));
        setLoading(false);
        return;
      }

      await appwriteAccount.updateRecovery(userId, secret, password);
      setMessage(_('Your password has been updated'));

      setTimeout(() => {
        router.push('/auth');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : _('Failed to update password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-md p-8'>
        <form onSubmit={handleSubmit} className='space-y-6'>
          <div className='space-y-1'>
            <label htmlFor='password' className='text-base-content/60 block text-sm font-normal'>
              {_('New Password')}
            </label>
            <input
              id='password'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={_('Your new password')}
              required
              disabled={loading}
              className='border-base-300 bg-base-100 text-base-content w-full rounded-md border px-4 py-2.5 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50'
            />
          </div>

          <div className='space-y-1'>
            <label
              htmlFor='confirmPassword'
              className='text-base-content/60 block text-sm font-normal'
            >
              {_('Confirm Password')}
            </label>
            <input
              id='confirmPassword'
              type='password'
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={_('Confirm your new password')}
              required
              disabled={loading}
              className='border-base-300 bg-base-100 text-base-content w-full rounded-md border px-4 py-2.5 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50'
            />
          </div>

          {error && <div className='text-sm text-red-500'>{error}</div>}
          {message && <div className='text-base-content text-sm'>{message}</div>}

          <button
            type='submit'
            disabled={loading || !password || !confirmPassword}
            className='w-full rounded-md bg-green-400 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed'
          >
            {loading ? _('Updating password ...') : _('Update password')}
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
      </div>
    </div>
  );
}
