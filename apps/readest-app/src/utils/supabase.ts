/**
 * Legacy Supabase compatibility stubs.
 * These are retained so that out-of-scope modules (storage, payments, stripe)
 * continue to compile. The returned clients are non-functional; any call will
 * throw at runtime. Remove this file once those modules are fully migrated.
 */

const throwNotMigrated = (): never => {
  throw new Error('Supabase has been replaced by Appwrite. This code path is not yet migrated.');
};

const proxyHandler: ProxyHandler<object> = {
  get: () => {
    return new Proxy(() => throwNotMigrated(), proxyHandler);
  },
  apply: () => throwNotMigrated(),
};

const createDeadProxy = (): unknown => new Proxy({}, proxyHandler);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createDeadProxy() as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createSupabaseClient = (_accessToken?: string): any => createDeadProxy();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createSupabaseAdminClient = (): any => createDeadProxy();
