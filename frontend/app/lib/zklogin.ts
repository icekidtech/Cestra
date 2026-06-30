/**
 * Google zkLogin (OIDC) helpers.
 *
 * Flow:
 *   1. startGoogleLogin() redirects the browser to Google's OAuth consent
 *      screen requesting an OpenID `id_token` (implicit flow).
 *   2. Google redirects back to /auth/callback with the signed id_token in the
 *      URL fragment.
 *   3. The callback page sends that id_token to the backend, which verifies
 *      Google's signature and derives the deterministic zkLogin Sui address.
 *
 * The backend performs the cryptographic verification + address derivation,
 * so no Sui SDK is required in the browser for authentication.
 */

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

/** Where Google sends the user back after consent. */
export function getRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/auth/callback`;
}

export function getGoogleClientId(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
}

/** True when a real Google OAuth client is configured. */
export function isGoogleConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

const NONCE_KEY = "cestra_oauth_nonce";
const STATE_KEY = "cestra_oauth_state";

function randomToken(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Begin the Google sign-in redirect. Stores a nonce + state in sessionStorage
 * so the callback can defend against replay/CSRF.
 */
export function startGoogleLogin(): void {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured");
  }

  const nonce = randomToken();
  const state = randomToken();
  sessionStorage.setItem(NONCE_KEY, nonce);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    state,
    prompt: "select_account",
  });

  window.location.href = `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface CallbackResult {
  idToken: string | null;
  error: string | null;
}

/**
 * Parse the OAuth redirect fragment (#id_token=...&state=...), validating the
 * state parameter. Returns the raw Google id_token to send to the backend.
 */
export function parseGoogleCallback(): CallbackResult {
  if (typeof window === "undefined") {
    return { idToken: null, error: "No window" };
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);

  const error = params.get("error");
  if (error) {
    return { idToken: null, error: params.get("error_description") || error };
  }

  const idToken = params.get("id_token");
  if (!idToken) {
    return { idToken: null, error: "No id_token returned by Google" };
  }

  const returnedState = params.get("state");
  const savedState = sessionStorage.getItem(STATE_KEY);
  if (savedState && returnedState !== savedState) {
    return { idToken: null, error: "State mismatch — possible CSRF" };
  }

  sessionStorage.removeItem(NONCE_KEY);
  sessionStorage.removeItem(STATE_KEY);

  return { idToken, error: null };
}
