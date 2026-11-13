// Test helper: load a module as a build with one EXPO_PUBLIC_* switch set.
//
// The chain profiles (../btcChain.ts, ../evmChain.ts) are read once, when
// their module loads, so a test that wants another chain loads a fresh copy
// of the module graph with the variable set, then puts the variable back.
// The require stays in the caller's `load` callback, so its relative path
// resolves from the test file:
//
//   const fork = withEvmChain('arbitrum-fork', () => jest.requireActual<typeof import('../endpoints')>('../endpoints'));
//
// Not a test file itself: jest only runs *.test.ts(x).
export function withEnv<T>(name: string, value: string, load: () => T): T {
  // Expo's lint rule forbids process.env[name] because the app bundle only
  // inlines dot access; jest reads the real environment, so a test may.
  const env: Record<string, string | undefined> = process.env;
  const previous = env[name];
  env[name] = value;
  try {
    let loaded: T | undefined;
    jest.isolateModules(() => {
      loaded = load();
    });
    return loaded as T;
  } finally {
    if (previous === undefined) delete env[name];
    else env[name] = previous;
  }
}

export const withBtcChain = <T>(chain: string, load: () => T): T => withEnv('EXPO_PUBLIC_BTC_CHAIN', chain, load);
export const withEvmChain = <T>(chain: string, load: () => T): T => withEnv('EXPO_PUBLIC_EVM_CHAIN', chain, load);
