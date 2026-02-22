import { createHash } from 'crypto';

/**
 * Digest Authentication implementation for NX Witness API
 */

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

/**
 * Parse WWW-Authenticate header to extract digest challenge parameters
 */
function parseDigestChallenge(authHeader: string): DigestChallenge | null {
  if (!authHeader || !authHeader.toLowerCase().startsWith('digest ')) {
    return null;
  }

  const challenge: Partial<DigestChallenge> = {};
  const parts = authHeader.substring(7).split(',');

  for (const part of parts) {
    const trimmedPart = part.trim();
    const equalIndex = trimmedPart.indexOf('=');
    
    if (equalIndex === -1) continue;
    
    const key = trimmedPart.substring(0, equalIndex).trim();
    const value = trimmedPart.substring(equalIndex + 1).trim();
    
    if (key && value) {
      // Remove quotes from value
      challenge[key as keyof DigestChallenge] = value.replace(/^"|"$/g, '');
    }
  }

  if (!challenge.realm || !challenge.nonce) {
    return null;
  }

  return challenge as DigestChallenge;
}

/**
 * Generate MD5 hash
 */
function md5(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

/**
 * Calculate digest response based on RFC 2617
 */
function calculateDigestResponse(
  username: string,
  password: string,
  method: string,
  uri: string,
  challenge: DigestChallenge,
  nc = '00000001',
  cnonce?: string
): string {
  const { realm, nonce, qop, algorithm = 'MD5' } = challenge;

  // HA1 = MD5(username:realm:password)
  const ha1 = md5(`${username}:${realm}:${password}`);
  console.log(`[Digest Auth] HA1 components: username=${username}, realm=${realm}`);

  // HA2 = MD5(method:uri)
  const ha2 = md5(`${method}:${uri}`);
  console.log(`[Digest Auth] HA2 components: method=${method}, uri=${uri}`);

  // Calculate response
  let response: string;
  if (qop === 'auth' || qop === 'auth-int') {
    if (!cnonce) {
      cnonce = md5(Math.random().toString());
    }
    // response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
    response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
    console.log(`[Digest Auth] Response calculated with qop=${qop}`);
  } else {
    // response = MD5(HA1:nonce:HA2)
    response = md5(`${ha1}:${nonce}:${ha2}`);
    console.log(`[Digest Auth] Response calculated without qop, nonce length=${nonce.length}`);
  }

  return response;
}

/**
 * Build Authorization header for digest authentication
 */
function buildDigestAuthHeader(
  username: string,
  password: string,
  method: string,
  uri: string,
  challenge: DigestChallenge,
  nc = '00000001',
  cnonce?: string
): string {
  const { realm, nonce, qop, opaque, algorithm = 'MD5' } = challenge;

  if (!cnonce && (qop === 'auth' || qop === 'auth-int')) {
    cnonce = md5(Math.random().toString());
  }

  const response = calculateDigestResponse(username, password, method, uri, challenge, nc, cnonce);

  let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;

  if (algorithm) {
    authHeader += `, algorithm="${algorithm}"`;
  }

  if (qop) {
    authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  }

  if (opaque) {
    authHeader += `, opaque="${opaque}"`;
  }

  return authHeader;
}

/**
 * Perform HTTP request with digest authentication
 * First makes a request to get the 401 challenge, then retries with digest auth
 */
export async function fetchWithDigestAuth(
  url: string,
  username: string,
  password: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = options.method || 'GET';
  const urlObj = new URL(url);
  const uri = urlObj.pathname + urlObj.search;

  console.log(`[Digest Auth] Attempting digest authentication for ${url}`);
  console.log(`[Digest Auth] Username: ${username}, URI: ${uri}`);

  // First request to get the challenge
  const initialResponse = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
    },
  });

  // If not 401, return the response (might be already authenticated or no auth required)
  if (initialResponse.status !== 401) {
    console.log(`[Digest Auth] No challenge needed, status: ${initialResponse.status}`);
    return initialResponse;
  }

  // Get the WWW-Authenticate header
  const authHeader = initialResponse.headers.get('WWW-Authenticate');
  if (!authHeader) {
    console.error('[Digest Auth] No WWW-Authenticate header found');
    return initialResponse;
  }

  console.log(`[Digest Auth] Received challenge: ${authHeader}`);

  // Parse the challenge
  const challenge = parseDigestChallenge(authHeader);
  if (!challenge) {
    console.error('[Digest Auth] Failed to parse digest challenge');
    return initialResponse;
  }

  console.log(`[Digest Auth] Parsed challenge - Realm: ${challenge.realm}, Nonce: ${challenge.nonce} (length: ${challenge.nonce.length}), QoP: ${challenge.qop || 'none'}, Algorithm: ${challenge.algorithm || 'MD5'}`);

  // Build digest auth header
  const digestAuthHeader = buildDigestAuthHeader(username, password, method, uri, challenge);
  console.log(`[Digest Auth] Built authorization header`);

  // Retry with authentication
  const authenticatedResponse = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': digestAuthHeader,
    },
  });

  console.log(`[Digest Auth] Authenticated request status: ${authenticatedResponse.status}`);

  return authenticatedResponse;
}

/**
 * Convenience function for GET requests with digest auth
 */
export async function digestAuthGet(
  url: string,
  username: string,
  password: string,
  headers?: Record<string, string>
): Promise<Response> {
  return fetchWithDigestAuth(url, username, password, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...headers,
    },
  });
}

/**
 * Convenience function for POST requests with digest auth
 */
export async function digestAuthPost(
  url: string,
  username: string,
  password: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<Response> {
  return fetchWithDigestAuth(url, username, password, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
