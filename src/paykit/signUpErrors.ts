// Why a sign-up failed, in words a person can act on.
//
// PaykitSessionBootstrap.signUp does three things in a row
// (paykit-sdk/src/pubky_session.rs, `sign_up`):
//
//   1. refuse if the identity's homeserver record names another homeserver
//      (Policy; nothing is sent or spent);
//   2. create the account on the homeserver with the invite code. If the
//      account exists already (HTTP 409), it republishes the identity's
//      homeserver record instead;
//   3. sign in to that account (start, approve and complete a Pubky grant
//      auth flow over the auth relay).
//
// The SDK reports the outcome as the error's tag and code, and retrying a
// sign-up with the same identity, homeserver and code is always safe. So a
// code is called bad only when the homeserver refused it:
//
//   'code-refused'     identity/signup_code_rejected: missing, malformed,
//                      unknown or already used.
//   'unreachable'      Transport: no connection, 5xx or 429. Try again with
//                      the same code.
//   'other-homeserver' Policy: this identity lives on another homeserver.
//                      Sign in instead.
//   'not-finished'     Identity, any other cause, at any step. The account
//                      may exist already, so keep the code and try again.
//
// Pure (no SDK import), so it is unit tested; errors.ts passes it the tag
// and code of a PaykitFfiError.

export type SignUpFailure = 'code-refused' | 'unreachable' | 'other-homeserver' | 'not-finished' | 'unknown';

export function signUpFailureFrom(tag: string | undefined, code: string | undefined): SignUpFailure {
  if (tag === 'Transport') return 'unreachable';
  if (tag === 'Policy') return 'other-homeserver';
  if (tag !== 'Identity') return 'unknown';
  return code === 'signup_code_rejected' ? 'code-refused' : 'not-finished';
}

/** The sentence the invite code screen shows, or undefined for the screen's generic message. */
export function signUpFailureMessage(failure: SignUpFailure): string | undefined {
  switch (failure) {
    case 'code-refused':
      return "The server refused this invite code. It may be mistyped or already used (each code works once). Check it and try again.";
    case 'unreachable':
      return "Can't reach the server right now. Check your connection and try again with the same code.";
    case 'other-homeserver':
      return 'This phrase already has an identity on another server, so it needs no invite code. Sign in instead.';
    case 'not-finished':
      return "Setting up your identity didn't finish. Try again with the same invite code: retrying is safe.";
    default:
      return undefined;
  }
}

/** After this failure the identity exists elsewhere: the screen switches to signing in. */
export function identityExistsAfter(failure: SignUpFailure): boolean {
  return failure === 'other-homeserver';
}
