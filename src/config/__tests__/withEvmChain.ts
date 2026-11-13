// Test helper: load a module as a build with EXPO_PUBLIC_EVM_CHAIN set.
//
// EVM_CHAIN (../evmChain.ts) is read once, when the module loads, so a test
// that wants another chain loads a fresh copy of the module graph with the
// variable set, then puts the variable back. The require stays in the
// caller's `load` callback, so its relative path resolves from the test file:
//
//   const fork = withEvmChain('arbitrum-fork', () => jest.requireActual<typeof import('../endpoints')>('../endpoints'));
//
// Not a test file itself: jest only runs *.test.ts(x).
export function withEvmChain<T>(chain: string, load: () => T): T {
  const previous = process.env.EXPO_PUBLIC_EVM_CHAIN;
  process.env.EXPO_PUBLIC_EVM_CHAIN = chain;
  try {
    let loaded: T | undefined;
    jest.isolateModules(() => {
      loaded = load();
    });
    return loaded as T;
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_EVM_CHAIN;
    else process.env.EXPO_PUBLIC_EVM_CHAIN = previous;
  }
}
