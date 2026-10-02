import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { Buffer } from 'buffer';
import { v4 as uuidv4 } from 'uuid';
import uiStore from '@/store/UIStore';

/**
 * Sign in with ChatGPT - lets a ChatGPT Plus/Pro subscriber spend their plan's allowance on the public
 * Responses API instead of an API key. https://developers.openai.com/siwc/token-sharing-open-source
 *
 * - Registration is dynamic: every sign-in starts with `client_id=dynamic_agent_client` and OpenAI issues
 *   a client id bound to the user + workspace, which every later token request must use.
 * - The redirect must be an HTTP loopback URL, so the browser part runs through `LoopbackAuthModule`
 *   (Kotlin/ObjC) which listens on 127.0.0.1 for the length of the sign-in.
 * - Tokens live in the keychain, never in AsyncStorage. `llmPreference.config.account` only holds the email
 *   so the provider pickers can tell a signed-in connection from an empty one.
 */

const { LoopbackAuthModule } = NativeModules;

const ISSUER = 'https://auth.openai.com';
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const OPENID_CONFIGURATION_URL = `${ISSUER}/.well-known/openid-configuration`;
export const CHATGPT_API_BASE_URL = 'https://api.openai.com/v1';
export { CHATGPT_MANAGE_USAGE_URL } from './constants';

const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
/** The scope that lets us bill requests to the user's ChatGPT plan. The consent screen lets users decline it. */
const PLAN_USAGE_SCOPE = 'chatgpt.tokens.use.direct';
const DYNAMIC_CLIENT_ID = 'dynamic_agent_client';
const APP_NAME = 'AnythingLLM';
/** Replaced by the native module with the port it is listening on. */
const PORT_PLACEHOLDER = '__LOOPBACK_PORT__';
/** Must stay exactly this - the docs: "`/callback` does not match `/auth/callback`". */
const CALLBACK_PATH = '/auth/callback';
const SIGN_IN_TIMEOUT_MS = 10 * 60_000;
/** Refresh this long before the access token expires so a request never goes out with a dying token. */
const REFRESH_SKEW_MS = 2 * 60_000;
const KEYCHAIN_SERVICE = 'com.anythingllm.chatgpt';

type StoredCredentials = {
  email: string;
  subject: string;
  /** The client id OpenAI issued for this sign-in - required for refresh and revocation. */
  client_id: string;
  ext_agent_host_id: string;
  id_token: string;
  access_token: string;
  refresh_token: string;
  /** Epoch ms. */
  expires_at: number;
  scopes: string[];
};

export type ChatGPTAccount = { email: string };

export type ChatGPTAuthErrorCode =
  | 'unavailable'
  | 'cancelled'
  | 'timeout'
  | 'no_browser'
  | 'denied'
  | 'plan_usage_not_granted'
  | 'invalid_response'
  | 'signed_out'
  | 'network'
  /** The plan cannot share usage (eg: ChatGPT Free) - see `signIn`. */
  | 'not_eligible'
  /** The code exchange was rejected - internal, retried once by `signIn`. */
  | 'invalid_grant';

export class ChatGPTAuthError extends Error {
  code: ChatGPTAuthErrorCode;
  constructor(code: ChatGPTAuthErrorCode, message: string) {
    super(message);
    this.name = 'ChatGPTAuthError';
    this.code = code;
  }
}

function log(text: string, ...args: any[]) {
  console.log(`\x1b[32m[ChatGPTAuth]\x1b[0m ${text}`, ...args);
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
}

/** 32 random bytes, base64url - used for the PKCE verifier, state and nonce. */
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function formBody(params: Record<string, string>): string {
  return Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

function parseQuery(url: string): Record<string, string> {
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.split('=');
    params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return params;
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Checks the ID token's claims. The signature is not verified against OpenAI's JWKS: the token came straight
 * from the token endpoint over TLS in response to our own code exchange, which OpenID Connect Core 3.1.3.7
 * accepts in place of signature validation. Everything an attacker could replay (issuer, audience, nonce,
 * expiry) is still checked.
 */
function validateIdToken(idToken: string, clientId: string, nonce: string): Record<string, any> {
  const claims = decodeJwtPayload(idToken);
  if (!claims) throw new ChatGPTAuthError('invalid_response', 'ChatGPT returned an unreadable ID token.');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER) throw new ChatGPTAuthError('invalid_response', 'ChatGPT ID token has an unexpected issuer.');
  if (!audiences.includes(clientId)) throw new ChatGPTAuthError('invalid_response', 'ChatGPT ID token was issued for another client.');
  if (claims.nonce !== nonce) throw new ChatGPTAuthError('invalid_response', 'ChatGPT ID token does not match this sign in.');
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) throw new ChatGPTAuthError('invalid_response', 'ChatGPT ID token has expired.');
  return claims;
}

async function postForm(url: string, params: Record<string, string>): Promise<{ ok: boolean; status: number; data: any }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: formBody(params),
    });
  } catch (error: any) {
    throw new ChatGPTAuthError('network', error?.message || 'Could not reach ChatGPT.');
  }
  const text = await response.text().catch(() => '');
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error_description: text.slice(0, 200) };
  }
  return { ok: response.ok, status: response.status, data };
}

class ChatGPTAuth {
  private credentials: StoredCredentials | null | undefined = undefined;
  /** In-flight refresh. Refresh tokens rotate, so two concurrent refreshes would invalidate each other. */
  private refreshing: Promise<StoredCredentials> | null = null;

  /** Whether this build has the native loopback module (it ships with the app, so only missing in tests). */
  isAvailable(): boolean {
    return !!LoopbackAuthModule;
  }

  /** Stable per-installation id OpenAI requires on every authorization - see "Host ID" in the docs. */
  private async hostId(): Promise<string> {
    const saved = await uiStore.getFromStorage<string | null>('chatgpt_host_id', null);
    if (saved) return saved;
    const created = `urn:uuid:${uuidv4()}`;
    await uiStore.setToStorage('chatgpt_host_id', created);
    return created;
  }

  private async load(): Promise<StoredCredentials | null> {
    if (this.credentials !== undefined) return this.credentials;
    try {
      const stored = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
      this.credentials = stored ? (JSON.parse(stored.password) as StoredCredentials) : null;
    } catch (error) {
      log('Could not read stored credentials', error);
      this.credentials = null;
    }
    return this.credentials;
  }

  private async save(credentials: StoredCredentials) {
    this.credentials = credentials;
    await Keychain.setGenericPassword(credentials.email || 'chatgpt', JSON.stringify(credentials), {
      service: KEYCHAIN_SERVICE,
      // Readable while the device is locked after first unlock - scheduled jobs run in the background.
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  }

  private async clear() {
    this.credentials = null;
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE }).catch(() => false);
  }

  async getAccount(): Promise<ChatGPTAccount | null> {
    const credentials = await this.load();
    return credentials ? { email: credentials.email } : null;
  }

  /**
   * Runs the full browser sign-in and stores the resulting tokens. Rejects with `cancelled` when the user
   * closes the browser or declines - callers should treat that as a no-op, not an error.
   *
   * The first sign-in registers this install with `dynamic_agent_client`; OpenAI answers with an issued client
   * id which we keep (`chatgpt_client_id`) and reuse for every later authorization. When the code exchange
   * answers `invalid_grant` the docs say to discard the code and authorize again with the issued id - we do
   * that once automatically.
   *
   * In practice that first `invalid_grant` is how an ineligible plan (eg: ChatGPT Free) surfaces: registration
   * succeeds, the exchange is refused, and the retry's consent screen then says "A required permission is
   * unavailable" and only offers Upgrade or Cancel. So a Cancel on the retry is reported as `not_eligible`
   * rather than swallowed like an ordinary cancel.
   */
  async signIn(): Promise<ChatGPTAccount> {
    if (!this.isAvailable()) throw new ChatGPTAuthError('unavailable', 'Sign in with ChatGPT is not available in this build.');

    try {
      return await this.authorizeOnce();
    } catch (error) {
      if (!(error instanceof ChatGPTAuthError) || error.code !== 'invalid_grant') throw error;
      log('Code exchange returned invalid_grant - authorizing again with the issued client id');
      try {
        return await this.authorizeOnce();
      } catch (retryError) {
        if (retryError instanceof ChatGPTAuthError && (retryError.code === 'denied' || retryError.code === 'invalid_grant')) {
          throw new ChatGPTAuthError('not_eligible', 'This ChatGPT account cannot share its plan usage.');
        }
        throw retryError;
      }
    }
  }

  /** One browser authorization + code exchange. Throws `invalid_grant` when OpenAI rejects the code. */
  private async authorizeOnce(): Promise<ChatGPTAccount> {
    const hostId = await this.hostId();
    const registeredClientId = await uiStore.getFromStorage<string | null>('chatgpt_client_id', null);
    const verifier = randomToken();
    const state = randomToken();
    const nonce = randomToken();
    const challenge: string = await LoopbackAuthModule.sha256Base64Url(verifier);
    const redirectTemplate = `http://127.0.0.1:${PORT_PLACEHOLDER}${CALLBACK_PATH}`;

    const authorizeUrl = `${AUTHORIZE_URL}?${formBody({
      client_id: registeredClientId ?? DYNAMIC_CLIENT_ID,
      // Only on the first registration - a reauthorization with the issued id omits it.
      ...(registeredClientId ? {} : { agent_name_hint: APP_NAME }),
      ext_agent_host_id: hostId,
      response_type: 'code',
      redirect_uri: redirectTemplate,
      scope: SCOPES,
      resource: CHATGPT_API_BASE_URL,
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    })}`;

    let callbackUrl: string;
    try {
      callbackUrl = await LoopbackAuthModule.authorize(authorizeUrl, CALLBACK_PATH, SIGN_IN_TIMEOUT_MS);
    } catch (error: any) {
      const code = error?.code;
      if (code === 'cancelled' || code === 'timeout' || code === 'no_browser') throw new ChatGPTAuthError(code, error?.message ?? code);
      throw new ChatGPTAuthError('unavailable', error?.message || 'Could not open the ChatGPT sign in page.');
    }

    const callback = parseQuery(callbackUrl);
    if (callback.state !== state) throw new ChatGPTAuthError('invalid_response', 'The sign in response did not match this request.');
    if (callback.error) {
      if (callback.error === 'access_denied') throw new ChatGPTAuthError('denied', callback.error_description || 'Access was denied.');
      throw new ChatGPTAuthError('invalid_response', callback.error_description || callback.error);
    }
    // A reauthorization may not repeat the client id - the one we sent is the one in use.
    const clientId = callback.client_id ?? registeredClientId;
    if (!callback.code || !clientId || clientId === DYNAMIC_CLIENT_ID) {
      throw new ChatGPTAuthError('invalid_response', 'ChatGPT did not complete app registration. Please try again.');
    }
    // Keep the registration before the one-time code exchange, so a failed exchange is retried with it
    // instead of registering the app again.
    await uiStore.setToStorage('chatgpt_client_id', clientId);

    // The redirect URI must match the authorize request exactly, port included.
    const port = callbackUrl.match(/^http:\/\/127\.0\.0\.1:(\d+)\//)?.[1];
    const redirectUri = redirectTemplate.replace(PORT_PLACEHOLDER, port ?? '');
    const { ok, status, data } = await postForm(TOKEN_URL, {
      grant_type: 'authorization_code',
      client_id: clientId,
      code: callback.code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: CHATGPT_API_BASE_URL,
    });
    if (!ok) log('Code exchange failed', { status, error: data?.error, reusedRegistration: !!registeredClientId });

    if (!ok && data?.error === 'invalid_grant') {
      // A rejected exchange with an id we reused means that registration is no longer usable - forget it
      // so the next attempt registers again instead of failing the same way forever.
      if (registeredClientId) await uiStore.setToStorage('chatgpt_client_id', null);
      throw new ChatGPTAuthError('invalid_grant', data?.error_description || 'invalid_grant');
    }
    if (!ok || !data?.access_token || !data?.refresh_token || !data?.id_token) {
      throw new ChatGPTAuthError('invalid_response', data?.error_description || data?.error || 'ChatGPT did not return tokens.');
    }

    const claims = validateIdToken(data.id_token, clientId, nonce);
    const scopes = String(data.scope ?? callback.scope ?? '').split(/\s+/).filter(Boolean);
    if (!scopes.includes(PLAN_USAGE_SCOPE)) {
      throw new ChatGPTAuthError('plan_usage_not_granted', 'Using your ChatGPT plan was not allowed during sign in.');
    }

    const email = claims.email ?? claims['https://api.openai.com/profile']?.email ?? '';
    await this.save({
      email,
      subject: claims.sub,
      client_id: clientId,
      ext_agent_host_id: hostId,
      id_token: data.id_token,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + Number(data.expires_in ?? 3600) * 1000,
      scopes,
    });
    log('Signed in', { email, clientId });
    return { email };
  }

  /**
   * A valid access token, refreshed first when it is close to expiring (or when `forceRefresh` - eg: the API
   * just answered 401). Throws `signed_out` when there is no session or the refresh token is no longer valid.
   */
  async getAccessToken({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<string> {
    const credentials = await this.load();
    if (!credentials) throw new ChatGPTAuthError('signed_out', 'Sign in with ChatGPT to use this provider.');
    if (!forceRefresh && credentials.expires_at - REFRESH_SKEW_MS > Date.now()) return credentials.access_token;

    if (!this.refreshing) {
      this.refreshing = this.refresh(credentials).finally(() => {
        this.refreshing = null;
      });
    }
    return (await this.refreshing).access_token;
  }

  private async refresh(credentials: StoredCredentials): Promise<StoredCredentials> {
    log('Refreshing access token');
    // No `scope` - the refresh keeps the original grant (see "Accounts and sessions" in the docs).
    const { ok, status, data } = await postForm(TOKEN_URL, {
      grant_type: 'refresh_token',
      client_id: credentials.client_id,
      refresh_token: credentials.refresh_token,
      resource: CHATGPT_API_BASE_URL,
    });

    if (!ok || !data?.access_token) {
      // invalid_grant = the refresh token was revoked, expired (30 days unused) or already rotated away.
      if (status === 400 || status === 401 || data?.error === 'invalid_grant') {
        await this.clear();
        throw new ChatGPTAuthError('signed_out', 'Your ChatGPT session has ended. Sign in again to keep using your plan.');
      }
      throw new ChatGPTAuthError('network', data?.error_description || data?.error || `Could not refresh the ChatGPT session (${status}).`);
    }

    const next: StoredCredentials = {
      ...credentials,
      access_token: data.access_token,
      // Refresh tokens rotate - always keep the replacement.
      refresh_token: data.refresh_token ?? credentials.refresh_token,
      id_token: data.id_token ?? credentials.id_token,
      expires_at: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    };
    await this.save(next);
    return next;
  }

  /** Revokes the refresh token (best effort) and forgets the session. */
  async signOut(): Promise<void> {
    const credentials = await this.load();
    await this.clear();
    if (!credentials) return;
    try {
      const configuration = await fetch(OPENID_CONFIGURATION_URL).then(res => res.json());
      const endpoint = configuration?.revocation_endpoint;
      if (!endpoint) return;
      await postForm(endpoint, {
        token: credentials.refresh_token,
        token_type_hint: 'refresh_token',
        client_id: credentials.client_id,
      });
    } catch (error) {
      log('Could not revoke the refresh token', error);
    }
  }
}

const chatgptAuth = new ChatGPTAuth();
export default chatgptAuth;
