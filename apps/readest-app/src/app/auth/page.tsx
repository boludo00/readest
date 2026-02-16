'use client';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ID, OAuthProvider as AppwriteOAuthProvider } from 'appwrite';

import { FcGoogle } from 'react-icons/fc';
import { FaApple, FaGithub, FaDiscord } from 'react-icons/fa';
import { IoArrowBack } from 'react-icons/io5';

import { useAuth } from '@/context/AuthContext';
import { appwriteAccount } from '@/utils/appwrite';
import { useEnv } from '@/context/EnvContext';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrafficLightStore } from '@/store/trafficLightStore';
import { getBaseUrl, isTauriAppPlatform } from '@/services/environment';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { start, cancel, onUrl, onInvalidUrl } from '@fabianlars/tauri-plugin-oauth';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import { handleAuthCallback } from '@/helpers/auth';
import { getAppleIdAuth, Scope } from './utils/appleIdAuth';
import { authWithCustomTab, authWithSafari } from './utils/nativeAuth';
import WindowButtons from '@/components/WindowButtons';

type OAuthProvider = 'google' | 'apple' | 'github' | 'discord';

const APPWRITE_OAUTH_PROVIDERS: Record<OAuthProvider, AppwriteOAuthProvider> = {
  google: AppwriteOAuthProvider.Google,
  apple: AppwriteOAuthProvider.Apple,
  github: AppwriteOAuthProvider.Github,
  discord: AppwriteOAuthProvider.Discord,
};

interface SingleInstancePayload {
  args: string[];
  cwd: string;
}

interface ProviderLoginProp {
  provider: OAuthProvider;
  handleSignIn: (provider: OAuthProvider) => void;
  Icon: React.ElementType;
  label: string;
}

const WEB_AUTH_CALLBACK = `${getBaseUrl()}/auth/callback`;
const DEEPLINK_CALLBACK = 'readest://auth-callback';
const USE_APPLE_SIGN_IN = process.env['NEXT_PUBLIC_USE_APPLE_SIGN_IN'] === 'true';

const ProviderLogin: React.FC<ProviderLoginProp> = ({ provider, handleSignIn, Icon, label }) => {
  return (
    <button
      onClick={() => handleSignIn(provider)}
      className={clsx(
        'mb-2 flex w-64 items-center justify-center rounded border p-2.5',
        'bg-base-100 border-base-300 hover:bg-base-200 shadow-sm transition',
      )}
    >
      <Icon />
      <span className='text-base-content/75 px-2 text-sm'>{label}</span>
    </button>
  );
};

type AuthView = 'sign_in' | 'sign_up' | 'magic_link' | 'forgotten_password';

export default function AuthPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const { envConfig, appService } = useEnv();
  const { safeAreaInsets, isRoundedWindow } = useThemeStore();
  const { isTrafficLightVisible } = useTrafficLightStore();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const [port, setPort] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const isOAuthServerRunning = useRef(false);
  const useCustomOAuth = useRef(false);

  const [authView, setAuthView] = useState<AuthView>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const headerRef = useRef<HTMLDivElement>(null);

  useTheme({ systemUIVisible: false });

  const getTauriRedirectTo = (isOAuth: boolean) => {
    if (
      !useCustomOAuth.current &&
      (process.env.NODE_ENV === 'production' || appService?.isMobileApp || USE_APPLE_SIGN_IN)
    ) {
      if (appService?.isMobileApp) {
        return isOAuth ? DEEPLINK_CALLBACK : WEB_AUTH_CALLBACK;
      }
      return DEEPLINK_CALLBACK;
    }
    return `http://localhost:${port}`;
  };

  const getWebRedirectTo = () => {
    return process.env.NODE_ENV === 'production'
      ? WEB_AUTH_CALLBACK
      : `${window.location.origin}/auth/callback`;
  };

  const tauriSignInApple = async () => {
    const request = {
      scope: ['fullName', 'email'] as Scope[],
    };
    if (appService?.isIOSApp || USE_APPLE_SIGN_IN) {
      try {
        const appleAuthResponse = await getAppleIdAuth(request);
        if (appleAuthResponse.identityToken) {
          // TODO: Appwrite v1.6+ supports creating sessions from provider tokens
          // For now, fall back to standard OAuth flow
          console.log('Apple native sign-in token received, using OAuth flow');
          await tauriSignIn('apple');
        }
      } catch (err) {
        console.error('Apple authentication error:', err);
      }
    } else {
      console.log('Sign in with Apple on this platform is not supported yet');
    }
  };

  const tauriSignIn = async (provider: OAuthProvider) => {
    const redirectTo = getTauriRedirectTo(true);

    // Construct the Appwrite OAuth URL
    const oauthUrl = `${process.env['NEXT_PUBLIC_APPWRITE_ENDPOINT']}/account/sessions/oauth2/${provider}?project=${process.env['NEXT_PUBLIC_APPWRITE_PROJECT_ID']}&success=${encodeURIComponent(redirectTo)}&failure=${encodeURIComponent(redirectTo)}`;

    if (appService?.isIOSApp || appService?.isMacOSApp) {
      const res = await authWithSafari({ authUrl: oauthUrl });
      if (res) {
        handleOAuthUrl(res.redirectUrl);
      }
    } else if (appService?.isAndroidApp) {
      const res = await authWithCustomTab({ authUrl: oauthUrl });
      if (res) {
        handleOAuthUrl(res.redirectUrl);
      }
    } else {
      await openUrl(oauthUrl);
    }
  };

  const handleOAuthUrl = async (url: string) => {
    console.log('Handle OAuth URL:', url);
    // Appwrite OAuth redirects include query params (not hash fragments)
    try {
      const parsedUrl = new URL(url);
      const error = parsedUrl.searchParams.get('error');
      if (error) {
        console.error('OAuth error:', error);
        return;
      }
      // After successful OAuth, Appwrite sets session cookies.
      // Finalize by reading the session.
      handleAuthCallback({
        login,
        navigate: router.push,
        next: '/library',
      });
    } catch (err) {
      console.error('Error handling OAuth URL:', err);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setErrorMsg('');

    try {
      if (authView === 'sign_up') {
        await appwriteAccount.create(ID.unique(), email, password);
        await appwriteAccount.createEmailPasswordSession(email, password);
      } else if (authView === 'sign_in') {
        await appwriteAccount.createEmailPasswordSession(email, password);
      } else if (authView === 'magic_link') {
        const redirectTo = isTauriAppPlatform() ? getTauriRedirectTo(false) : getWebRedirectTo();
        await appwriteAccount.createMagicURLToken(ID.unique(), email, redirectTo);
        setMessage(_('Check your email for the magic link'));
        setLoading(false);
        return;
      } else if (authView === 'forgotten_password') {
        const redirectTo = isTauriAppPlatform()
          ? getTauriRedirectTo(false)
          : getWebRedirectTo().replace('/callback', '/recovery');
        await appwriteAccount.createRecovery(email, redirectTo);
        setMessage(_('Check your email for the password reset link'));
        setLoading(false);
        return;
      }

      // Session created — finalize
      const user = await appwriteAccount.get();
      const jwtResponse = await appwriteAccount.createJWT();
      login(jwtResponse.jwt, user);

      const redirectTo = new URLSearchParams(window.location.search).get('redirect');
      router.push(redirectTo ?? '/library');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '';
      // If Appwrite says a session is already active, just finalize it
      if (errMsg.toLowerCase().includes('session is active')) {
        try {
          const existingUser = await appwriteAccount.get();
          const jwtResponse = await appwriteAccount.createJWT();
          login(jwtResponse.jwt, existingUser);
          const redirectTo = new URLSearchParams(window.location.search).get('redirect');
          router.push(redirectTo ?? '/library');
          return;
        } catch {
          // Fall through to show generic error
        }
      }
      setErrorMsg(errMsg || _('Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  const webSignIn = async (provider: OAuthProvider) => {
    const redirectTo = getWebRedirectTo();
    const appwriteProvider = APPWRITE_OAUTH_PROVIDERS[provider];
    appwriteAccount.createOAuth2Session(appwriteProvider, redirectTo, redirectTo);
  };

  const startTauriOAuth = async () => {
    try {
      if (
        !useCustomOAuth.current &&
        (process.env.NODE_ENV === 'production' || appService?.isMobileApp || USE_APPLE_SIGN_IN)
      ) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const currentWindow = getCurrentWindow();
        currentWindow.listen('single-instance', ({ event, payload }) => {
          console.log('Received deep link:', event, payload);
          const { args } = payload as SingleInstancePayload;
          if (args?.[1]) {
            handleOAuthUrl(args[1]);
          }
        });
        await onOpenUrl((urls) => {
          urls.forEach((url) => {
            handleOAuthUrl(url);
          });
        });
      } else {
        const port = await start();
        setPort(port);
        console.log(`OAuth server started on port ${port}`);

        await onUrl(handleOAuthUrl);
        await onInvalidUrl((url) => {
          console.log('Received invalid OAuth URL:', url);
        });
      }
    } catch (error) {
      console.error('Error starting OAuth server:', error);
    }
  };

  const stopTauriOAuth = async () => {
    try {
      if (port) {
        await cancel(port);
        console.log('OAuth server stopped');
      }
    } catch (error) {
      console.error('Error stopping OAuth server:', error);
    }
  };

  const handleGoBack = () => {
    settings.keepLogin = false;
    setSettings(settings);
    saveSettings(envConfig, settings);
    const redirectTo = new URLSearchParams(window.location.search).get('redirect');
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.back();
    }
  };

  useEffect(() => {
    if (!isTauriAppPlatform()) return;
    if (isOAuthServerRunning.current) return;
    isOAuthServerRunning.current = true;

    invoke('get_environment_variable', { name: 'USE_CUSTOM_OAUTH' }).then((value) => {
      if (value === 'true') {
        useCustomOAuth.current = true;
      }
    });

    startTauriOAuth();
    return () => {
      isOAuthServerRunning.current = false;
      stopTauriOAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect an already-active Appwrite session and auto-finalize instead of
  // showing the login form (prevents "session already active" errors).
  const sessionChecked = useRef(false);
  useEffect(() => {
    if (sessionChecked.current) return;
    sessionChecked.current = true;

    (async () => {
      try {
        const currentUser = await appwriteAccount.get();
        const jwtResponse = await appwriteAccount.createJWT();
        login(jwtResponse.jwt, currentUser);

        const redirectTo = new URLSearchParams(window.location.search).get('redirect');
        router.push(redirectTo ?? '/library');
      } catch {
        // No active session — show the login form as usual
      }
    })();
  }, [login, router]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  const emailForm = (
    <form onSubmit={handleEmailAuth} className='w-full space-y-4'>
      <div className='space-y-1'>
        <label htmlFor='email' className='text-base-content/60 block text-sm'>
          {_('Email address')}
        </label>
        <input
          id='email'
          type='email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={_('Your email address')}
          required
          disabled={loading}
          className='border-base-300 bg-base-100 text-base-content w-full rounded-md border px-4 py-2.5 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50'
        />
      </div>

      {(authView === 'sign_in' || authView === 'sign_up') && (
        <div className='space-y-1'>
          <label htmlFor='password' className='text-base-content/60 block text-sm'>
            {authView === 'sign_up' ? _('Create a Password') : _('Your Password')}
          </label>
          <input
            id='password'
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={_('Your password')}
            required
            disabled={loading}
            className='border-base-300 bg-base-100 text-base-content w-full rounded-md border px-4 py-2.5 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50'
          />
        </div>
      )}

      {errorMsg && <div className='text-sm text-red-500'>{errorMsg}</div>}
      {message && <div className='text-base-content text-sm'>{message}</div>}

      <button
        type='submit'
        disabled={loading}
        className='w-full rounded-md bg-green-400 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed'
      >
        {loading
          ? authView === 'sign_up'
            ? _('Signing up...')
            : _('Signing in...')
          : authView === 'sign_up'
            ? _('Sign up')
            : authView === 'magic_link'
              ? _('Send a magic link email')
              : authView === 'forgotten_password'
                ? _('Send reset password instructions')
                : _('Sign in')}
      </button>

      <div className='flex flex-col items-center gap-1 text-sm'>
        {authView === 'sign_in' && (
          <>
            <button
              type='button'
              onClick={() => {
                setAuthView('sign_up');
                setErrorMsg('');
                setMessage('');
              }}
              className='text-base-content/60 hover:underline'
            >
              {_("Don't have an account? Sign up")}
            </button>
            <button
              type='button'
              onClick={() => {
                setAuthView('magic_link');
                setErrorMsg('');
                setMessage('');
              }}
              className='text-base-content/60 hover:underline'
            >
              {_('Send a magic link email')}
            </button>
            <button
              type='button'
              onClick={() => {
                setAuthView('forgotten_password');
                setErrorMsg('');
                setMessage('');
              }}
              className='text-base-content/60 hover:underline'
            >
              {_('Forgot your password?')}
            </button>
          </>
        )}
        {authView !== 'sign_in' && (
          <button
            type='button'
            onClick={() => {
              setAuthView('sign_in');
              setErrorMsg('');
              setMessage('');
            }}
            className='text-base-content/60 hover:underline'
          >
            {_('Already have an account? Sign in')}
          </button>
        )}
      </div>
    </form>
  );

  return isTauriAppPlatform() ? (
    <div
      className={clsx(
        'bg-base-100 full-height inset-0 flex select-none flex-col items-center overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        className={clsx('flex h-full w-full flex-col items-center overflow-y-auto')}
        style={{
          paddingTop: `${safeAreaInsets?.top || 0}px`,
        }}
      >
        <div
          ref={headerRef}
          className={clsx(
            'fixed z-10 flex w-full items-center justify-between py-2 pe-6 ps-4',
            appService?.hasTrafficLight && 'pt-11',
          )}
        >
          <button
            aria-label={_('Go Back')}
            onClick={handleGoBack}
            className={clsx('btn btn-ghost h-12 min-h-12 w-12 p-0 sm:h-8 sm:min-h-8 sm:w-8')}
          >
            <IoArrowBack className='text-base-content' />
          </button>

          {appService?.hasWindowBar && (
            <WindowButtons
              headerRef={headerRef}
              showMinimize={!isTrafficLightVisible}
              showMaximize={!isTrafficLightVisible}
              showClose={!isTrafficLightVisible}
              onClose={handleGoBack}
            />
          )}
        </div>
        <div
          className={clsx(
            'z-20 flex flex-col items-center pb-8',
            appService?.hasTrafficLight ? 'mt-24' : 'mt-12',
          )}
          style={{ maxWidth: '420px' }}
        >
          <ProviderLogin
            provider='google'
            handleSignIn={tauriSignIn}
            Icon={FcGoogle}
            label={_('Sign in with {{provider}}', { provider: 'Google' })}
          />
          <ProviderLogin
            provider='apple'
            handleSignIn={
              appService?.isIOSApp || USE_APPLE_SIGN_IN ? tauriSignInApple : tauriSignIn
            }
            Icon={FaApple}
            label={_('Sign in with {{provider}}', { provider: 'Apple' })}
          />
          <ProviderLogin
            provider='github'
            handleSignIn={tauriSignIn}
            Icon={FaGithub}
            label={_('Sign in with {{provider}}', { provider: 'GitHub' })}
          />
          <ProviderLogin
            provider='discord'
            handleSignIn={tauriSignIn}
            Icon={FaDiscord}
            label={_('Sign in with {{provider}}', { provider: 'Discord' })}
          />
          <hr aria-hidden='true' className='border-base-300 my-3 mt-6 w-64 border-t' />
          <div className='w-full px-4'>{emailForm}</div>
        </div>
      </div>
    </div>
  ) : (
    <div style={{ maxWidth: '420px', margin: 'auto', padding: '2rem', paddingTop: '4rem' }}>
      <button
        onClick={handleGoBack}
        className='btn btn-ghost fixed left-6 top-6 h-8 min-h-8 w-8 p-0'
      >
        <IoArrowBack className='text-base-content' />
      </button>

      <div className='mb-6 flex flex-col gap-2'>
        <ProviderLogin
          provider='google'
          handleSignIn={webSignIn}
          Icon={FcGoogle}
          label={_('Sign in with {{provider}}', { provider: 'Google' })}
        />
        <ProviderLogin
          provider='apple'
          handleSignIn={webSignIn}
          Icon={FaApple}
          label={_('Sign in with {{provider}}', { provider: 'Apple' })}
        />
        <ProviderLogin
          provider='github'
          handleSignIn={webSignIn}
          Icon={FaGithub}
          label={_('Sign in with {{provider}}', { provider: 'GitHub' })}
        />
        <ProviderLogin
          provider='discord'
          handleSignIn={webSignIn}
          Icon={FaDiscord}
          label={_('Sign in with {{provider}}', { provider: 'Discord' })}
        />
      </div>

      <hr aria-hidden='true' className='border-base-300 my-4 border-t' />

      {emailForm}
    </div>
  );
}
