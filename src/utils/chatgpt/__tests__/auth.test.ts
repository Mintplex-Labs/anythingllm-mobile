/**
 * The Sign in with ChatGPT paths only an eligible (Plus/Pro) account reaches - a successful code exchange,
 * ID token checks, keychain storage, refresh rotation and sign-out - against mocked OpenAI endpoints.
 * Callback and error shapes mirror what a real (free) account produced on device.
 */
const mockStorage = new Map<string, any>();
const mockKeychain: { value: { username: string; password: string } | null } = { value: null };
const mockAuthorize = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    LoopbackAuthModule: {
      sha256Base64Url: (input: string) => Promise.resolve(require('crypto').createHash('sha256').update(input).digest('base64url')),
      authorize: (...args: any[]) => mockAuthorize(...args),
    },
  },
}));
jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY' },
  setGenericPassword: async (username: string, password: string) => {
    mockKeychain.value = { username, password };
    return true;
  },
  getGenericPassword: async () => mockKeychain.value ?? false,
  resetGenericPassword: async () => {
    mockKeychain.value = null;
    return true;
  },
}));
jest.mock('@/store/UIStore', () => ({
  __esModule: true,
  default: {
    getFromStorage: async (key: string, fallback: any) => (mockStorage.has(key) ? mockStorage.get(key) : fallback),
    setToStorage: async (key: string, value: any) => {
      mockStorage.set(key, value);
    },
  },
}));
jest.mock('uuid', () => ({ v4: () => '11111111-2222-4333-8444-555555555555' }));

import { createHash } from 'crypto';

const ISSUED_CLIENT_ID = 'oaiapp_TEST123';
const PLAN_SCOPES = 'chatgpt.tokens.use.direct email offline_access openid profile resource.invoke';
const TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token';

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (claims: object) => `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(claims)}.signature`;
const query = (url: string) => Object.fromEntries(new URL(url).searchParams);
const formOf = (init: any) => Object.fromEntries(new URLSearchParams(init.body));

type FetchHandler = (url: string, init: any) => { status: number; body: any };
let fetchHandler: FetchHandler;
const fetchMock = jest.fn(async (url: string, init: any = {}) => {
  const { status, body } = fetchHandler(url, init);
  return { ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body };
});

/** Approves the consent screen: echoes state and returns a code plus the issued client id, like OpenAI does. */
function approveSignIn({ clientId = ISSUED_CLIENT_ID as string | null, scope = PLAN_SCOPES } = {}) {
  mockAuthorize.mockImplementation(async (url: string, callbackPath: string) => {
    const { state } = query(url);
    const clientParam = clientId ? `&client_id=${clientId}` : '';
    return `http://127.0.0.1:51000${callbackPath}?code=ac_code-${mockAuthorize.mock.calls.length}&scope=${encodeURIComponent(scope)}&state=${state}${clientParam}`;
  });
}

/** The token endpoint, issuing an ID token for whichever authorize request is current. */
function tokenEndpoint({ email = 'tim@example.com', idTokenOverrides = {}, scope = PLAN_SCOPES } = {}) {
  let refreshCount = 0;
  fetchHandler = (url, init) => {
    if (url !== TOKEN_URL) throw new Error(`Unexpected fetch ${url}`);
    const form = formOf(init);
    if (form.grant_type === 'authorization_code') {
      const authorizeUrl = mockAuthorize.mock.calls[mockAuthorize.mock.calls.length - 1][0];
      const idToken = jwt({
        iss: 'https://auth.openai.com',
        aud: [form.client_id],
        sub: 'user-abc',
        email,
        nonce: query(authorizeUrl).nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...idTokenOverrides,
      });
      return { status: 200, body: { access_token: 'access-1', refresh_token: 'refresh-1', id_token: idToken, token_type: 'Bearer', expires_in: 3600, scope } };
    }
    refreshCount++;
    return { status: 200, body: { access_token: `access-r${refreshCount}`, refresh_token: `refresh-r${refreshCount}`, token_type: 'Bearer', expires_in: 3600 } };
  };
}

/** A fresh ChatGPTAuth singleton - its in-memory session cache must not leak between tests. */
function loadAuth() {
  let auth: typeof import('../auth');
  jest.isolateModules(() => {
    auth = require('../auth');
  });
  return auth!;
}

const stored = () => (mockKeychain.value ? JSON.parse(mockKeychain.value.password) : null);
const tokenRequests = () => fetchMock.mock.calls.filter(([url]) => url === TOKEN_URL).map(([, init]) => formOf(init));

beforeAll(() => {
  global.fetch = fetchMock as any;
});

beforeEach(() => {
  mockStorage.clear();
  mockKeychain.value = null;
  mockAuthorize.mockReset();
  fetchMock.mockClear();
  jest.restoreAllMocks();
});

describe('signIn', () => {
  test('first sign-in registers dynamically, exchanges with the issued client id, and stores the session', async () => {
    approveSignIn();
    tokenEndpoint();
    const { default: chatgptAuth } = loadAuth();

    await expect(chatgptAuth.signIn()).resolves.toEqual({ email: 'tim@example.com' });

    const [authorizeUrl, callbackPath] = mockAuthorize.mock.calls[0];
    const authorize = query(authorizeUrl);
    expect(callbackPath).toBe('/auth/callback');
    expect(authorize).toMatchObject({
      client_id: 'dynamic_agent_client',
      agent_name_hint: 'AnythingLLM',
      ext_agent_host_id: 'urn:uuid:11111111-2222-4333-8444-555555555555',
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1:__LOOPBACK_PORT__/auth/callback',
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      resource: 'https://api.openai.com/v1',
      code_challenge_method: 'S256',
    });

    const [exchange] = tokenRequests();
    expect(exchange).toEqual({
      grant_type: 'authorization_code',
      client_id: ISSUED_CLIENT_ID,
      code: 'ac_code-1',
      code_verifier: expect.any(String),
      redirect_uri: 'http://127.0.0.1:51000/auth/callback',
      resource: 'https://api.openai.com/v1',
    });
    expect(createHash('sha256').update(exchange.code_verifier).digest('base64url')).toBe(authorize.code_challenge);

    expect(stored()).toMatchObject({ email: 'tim@example.com', client_id: ISSUED_CLIENT_ID, access_token: 'access-1', refresh_token: 'refresh-1', subject: 'user-abc' });
    expect(mockStorage.get('chatgpt_client_id')).toBe(ISSUED_CLIENT_ID);
    await expect(chatgptAuth.getAccount()).resolves.toEqual({ email: 'tim@example.com' });
  });

  test('a later sign-in reuses the issued client id and omits agent_name_hint', async () => {
    mockStorage.set('chatgpt_client_id', ISSUED_CLIENT_ID);
    approveSignIn({ clientId: null }); // a reauthorization need not echo the client id
    tokenEndpoint();
    const { default: chatgptAuth } = loadAuth();

    await chatgptAuth.signIn();

    const authorize = query(mockAuthorize.mock.calls[0][0]);
    expect(authorize.client_id).toBe(ISSUED_CLIENT_ID);
    expect(authorize.agent_name_hint).toBeUndefined();
    expect(tokenRequests()[0].client_id).toBe(ISSUED_CLIENT_ID);
  });

  test('free plan: invalid_grant, then the retry with the issued id is cancelled -> not_eligible', async () => {
    let attempt = 0;
    mockAuthorize.mockImplementation(async (url: string, callbackPath: string) => {
      const { state } = query(url);
      attempt++;
      // What a free account produced on device: a code first, then "A required permission is unavailable" -> Cancel.
      if (attempt === 1) return `http://127.0.0.1:51000${callbackPath}?code=ac_free&scope=${encodeURIComponent(PLAN_SCOPES)}&state=${state}&client_id=${ISSUED_CLIENT_ID}`;
      return `http://127.0.0.1:51000${callbackPath}?error=access_denied&error_description=denied&state=${state}`;
    });
    fetchHandler = () => ({ status: 400, body: { error: 'invalid_grant' } });
    const { default: chatgptAuth, ChatGPTAuthError } = loadAuth();

    const error = await chatgptAuth.signIn().catch(e => e);
    expect(error).toBeInstanceOf(ChatGPTAuthError);
    expect(error.code).toBe('not_eligible');
    expect(query(mockAuthorize.mock.calls[1][0]).client_id).toBe(ISSUED_CLIENT_ID);
    expect(stored()).toBeNull();
  });

  test('invalid_grant once, then success on the retry', async () => {
    approveSignIn();
    tokenEndpoint();
    const succeed = fetchHandler;
    let exchanges = 0;
    fetchHandler = (url, init) => (++exchanges === 1 ? { status: 400, body: { error: 'invalid_grant' } } : succeed(url, init));
    const { default: chatgptAuth } = loadAuth();

    await expect(chatgptAuth.signIn()).resolves.toEqual({ email: 'tim@example.com' });
    expect(mockAuthorize).toHaveBeenCalledTimes(2);
    expect(stored()?.access_token).toBe('access-1');
  });

  test.each([
    ['nonce', { nonce: 'someone-elses-nonce' }],
    ['audience', { aud: ['oaiapp_OTHER'] }],
    ['issuer', { iss: 'https://evil.example.com' }],
    ['expiry', { exp: Math.floor(Date.now() / 1000) - 60 }],
  ])('rejects an ID token with the wrong %s', async (_label, overrides) => {
    approveSignIn();
    tokenEndpoint({ idTokenOverrides: overrides });
    const { default: chatgptAuth } = loadAuth();

    await expect(chatgptAuth.signIn()).rejects.toMatchObject({ code: 'invalid_response' });
    expect(stored()).toBeNull();
  });

  test('requires the plan usage scope', async () => {
    const identityOnly = 'email offline_access openid profile';
    approveSignIn({ scope: identityOnly });
    tokenEndpoint({ scope: identityOnly });
    const { default: chatgptAuth } = loadAuth();

    await expect(chatgptAuth.signIn()).rejects.toMatchObject({ code: 'plan_usage_not_granted' });
    expect(stored()).toBeNull();
  });

  test('rejects a callback whose state does not match', async () => {
    mockAuthorize.mockResolvedValue(`http://127.0.0.1:51000/auth/callback?code=ac_x&state=forged&client_id=${ISSUED_CLIENT_ID}`);
    tokenEndpoint();
    const { default: chatgptAuth } = loadAuth();

    await expect(chatgptAuth.signIn()).rejects.toMatchObject({ code: 'invalid_response' });
    expect(tokenRequests()).toHaveLength(0);
  });

  test('closing the browser is a silent cancel', async () => {
    mockAuthorize.mockRejectedValue(Object.assign(new Error('Sign in was cancelled.'), { code: 'cancelled' }));
    const { default: chatgptAuth } = loadAuth();
    await expect(chatgptAuth.signIn()).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe('getAccessToken', () => {
  async function signedIn() {
    approveSignIn();
    tokenEndpoint();
    const auth = loadAuth();
    await auth.default.signIn();
    fetchMock.mockClear();
    return auth;
  }

  test('returns the stored token while it is fresh', async () => {
    const { default: chatgptAuth } = await signedIn();
    await expect(chatgptAuth.getAccessToken()).resolves.toBe('access-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('refreshes near expiry with the issued client id and no scope, and keeps the rotated refresh token', async () => {
    const { default: chatgptAuth } = await signedIn();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 59 * 60_000); // 1 minute left - inside the refresh window

    await expect(chatgptAuth.getAccessToken()).resolves.toBe('access-r1');
    expect(tokenRequests()[0]).toEqual({
      grant_type: 'refresh_token',
      client_id: ISSUED_CLIENT_ID,
      refresh_token: 'refresh-1',
      resource: 'https://api.openai.com/v1',
    });
    expect(stored()).toMatchObject({ access_token: 'access-r1', refresh_token: 'refresh-r1' });

    // The next refresh must use the replacement - the old token is spent.
    await chatgptAuth.getAccessToken({ forceRefresh: true });
    expect(tokenRequests()[1].refresh_token).toBe('refresh-r1');
  });

  test('concurrent callers share one refresh', async () => {
    const { default: chatgptAuth } = await signedIn();
    const tokens = await Promise.all([
      chatgptAuth.getAccessToken({ forceRefresh: true }),
      chatgptAuth.getAccessToken({ forceRefresh: true }),
      chatgptAuth.getAccessToken({ forceRefresh: true }),
    ]);
    expect(tokens).toEqual(['access-r1', 'access-r1', 'access-r1']);
    expect(tokenRequests()).toHaveLength(1);
  });

  test('a session survives an app restart (read back from the keychain)', async () => {
    await signedIn();
    const { default: restarted } = loadAuth();
    await expect(restarted.getAccessToken()).resolves.toBe('access-1');
    await expect(restarted.getAccount()).resolves.toEqual({ email: 'tim@example.com' });
  });

  test('a rejected refresh token ends the session', async () => {
    const { default: chatgptAuth } = await signedIn();
    fetchHandler = () => ({ status: 400, body: { error: 'invalid_grant' } });

    await expect(chatgptAuth.getAccessToken({ forceRefresh: true })).rejects.toMatchObject({ code: 'signed_out' });
    expect(stored()).toBeNull();
    await expect(chatgptAuth.getAccount()).resolves.toBeNull();
  });

  test('without a session it asks to sign in', async () => {
    const { default: chatgptAuth } = loadAuth();
    await expect(chatgptAuth.getAccessToken()).rejects.toMatchObject({ code: 'signed_out' });
  });
});

describe('signOut', () => {
  test('revokes the refresh token and clears the session, keeping the registration', async () => {
    approveSignIn();
    tokenEndpoint();
    const { default: chatgptAuth } = loadAuth();
    await chatgptAuth.signIn();

    const revocations: any[] = [];
    fetchHandler = (url, init) => {
      if (url.endsWith('/.well-known/openid-configuration')) return { status: 200, body: { revocation_endpoint: 'https://auth.openai.com/api/accounts/oauth/revoke' } };
      revocations.push({ url, form: formOf(init) });
      return { status: 200, body: {} };
    };

    await chatgptAuth.signOut();
    expect(revocations).toEqual([{
      url: 'https://auth.openai.com/api/accounts/oauth/revoke',
      form: { token: 'refresh-1', token_type_hint: 'refresh_token', client_id: ISSUED_CLIENT_ID },
    }]);
    expect(stored()).toBeNull();
    expect(mockStorage.get('chatgpt_client_id')).toBe(ISSUED_CLIENT_ID);
  });
});
