import { appwriteAccount } from '@/utils/appwrite';
import { createAppwriteSessionClient } from '@/utils/appwrite.server';
import { type AppwriteUser } from '@/context/AuthContext';
import { UserPlan } from '@/types/quota';
import { DEFAULT_DAILY_TRANSLATION_QUOTA, DEFAULT_STORAGE_QUOTA } from '@/services/constants';
import { isWebAppPlatform } from '@/services/environment';
import { getDailyUsage } from '@/services/translators/utils';

export const getSubscriptionPlan = (_token: string): UserPlan => {
  // Self-hosted instance — return 'pro' for full access
  return 'pro';
};

export const getUserProfilePlan = (_token: string): UserPlan => {
  return 'pro';
};

export const STORAGE_QUOTA_GRACE_BYTES = 10 * 1024 * 1024; // 10 MB grace

export const getStoragePlanData = (_token: string) => {
  const plan: UserPlan = 'pro';
  const usage = 0;
  const fixedQuota = parseInt(process.env['NEXT_PUBLIC_STORAGE_FIXED_QUOTA'] || '0');
  const planQuota = fixedQuota || DEFAULT_STORAGE_QUOTA[plan] || DEFAULT_STORAGE_QUOTA['pro'];
  const quota = planQuota;

  return {
    plan,
    usage,
    quota,
  };
};

export const getTranslationPlanData = (_token: string) => {
  const plan: UserPlan = 'pro';
  const usage = getDailyUsage() || 0;
  const quota = DEFAULT_DAILY_TRANSLATION_QUOTA[plan];

  return {
    plan,
    usage,
    quota,
  };
};

export const getDailyTranslationPlanData = (_token: string) => {
  const plan: UserPlan = 'pro';
  const fixedQuota = parseInt(process.env['NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA'] || '0');
  const quota =
    fixedQuota || DEFAULT_DAILY_TRANSLATION_QUOTA[plan] || DEFAULT_DAILY_TRANSLATION_QUOTA['pro'];

  return {
    plan,
    quota,
  };
};

export const getAccessToken = async (): Promise<string | null> => {
  if (isWebAppPlatform()) {
    return localStorage.getItem('token') ?? null;
  }
  try {
    const jwtResponse = await appwriteAccount.createJWT();
    return jwtResponse.jwt;
  } catch {
    // Appwrite session cookies may not persist in Tauri WebView (especially iOS).
    // Fall back to the JWT stored in localStorage by AuthContext.
    return localStorage.getItem('token') ?? null;
  }
};

export const getUserID = async (): Promise<string | null> => {
  if (isWebAppPlatform()) {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.$id ?? null;
    } catch {
      return null;
    }
  }
  try {
    const user = await appwriteAccount.get();
    return user.$id;
  } catch {
    // Fall back to localStorage when Appwrite session cookies aren't available (iOS WebView)
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.$id ?? null;
    } catch {
      return null;
    }
  }
};

export const validateUserAndToken = async (
  authHeader: string | null | undefined,
): Promise<{ user?: AppwriteUser; token?: string }> => {
  if (!authHeader) return {};

  const token = authHeader.replace('Bearer ', '');
  try {
    const { account } = createAppwriteSessionClient(token);
    const user = await account.get();
    if (!user) return {};
    return { user, token };
  } catch {
    return {};
  }
};
