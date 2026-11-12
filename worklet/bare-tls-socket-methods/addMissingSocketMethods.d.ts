// Types for addMissingSocketMethods.js, so the jest test can import it.
export type SocketMethodName = 'setTimeout' | 'setKeepAlive' | 'setNoDelay';

export function addMissingSocketMethods(
  SocketClass: abstract new (...args: never[]) => unknown,
): SocketMethodName[];
