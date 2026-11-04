// Why a sign-up failed, from the SDK's error tag and code
// (paykit-sdk/src/pubky_session.rs and paykit-ffi/src/errors.rs at the pinned commit).
import { identityExistsAfter, signUpFailureFrom, signUpFailureMessage } from '../signUpErrors';

describe('signUpFailureFrom', () => {
  it('calls a code bad only when the homeserver refused it', () => {
    expect(signUpFailureFrom('Identity', 'signup_code_rejected')).toBe('code-refused');
    expect(signUpFailureFrom('Identity', 'identity_error')).toBe('not-finished');
  });

  it('tells an unreachable server and another homeserver from the rest', () => {
    expect(signUpFailureFrom('Transport', 'transport_error')).toBe('unreachable');
    expect(signUpFailureFrom('Policy', 'policy_error')).toBe('other-homeserver');
  });

  it('falls back to unknown for anything else', () => {
    expect(signUpFailureFrom('Storage', 'storage_error')).toBe('unknown');
    expect(signUpFailureFrom(undefined, undefined)).toBe('unknown');
  });
});

describe('signUpFailureMessage', () => {
  it('has a sentence with a next step for each known cause, none for unknown', () => {
    expect(signUpFailureMessage('code-refused')).toMatch(/mistyped or already used/);
    expect(signUpFailureMessage('unreachable')).toMatch(/same code/);
    expect(signUpFailureMessage('other-homeserver')).toMatch(/Sign in instead/);
    expect(signUpFailureMessage('not-finished')).toMatch(/same invite code/);
    expect(signUpFailureMessage('unknown')).toBeUndefined();
  });

  it('switches to signing in only when the identity lives elsewhere', () => {
    expect(identityExistsAfter('other-homeserver')).toBe(true);
    for (const failure of ['code-refused', 'unreachable', 'not-finished', 'unknown'] as const) {
      expect(identityExistsAfter(failure)).toBe(false);
    }
  });
});
