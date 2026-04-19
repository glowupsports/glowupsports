import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Apple's public key set used to verify identity tokens issued for Sign in
// with Apple. The remote JWKS is cached internally by `jose` so we only need
// to construct it once.
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "com.glowupsports.app";

export interface AppleIdentityClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean | "true" | "false";
  is_private_email?: boolean | "true" | "false";
}

/**
 * Verify an Apple identity token end-to-end:
 *  - signature against Apple's public JWKS
 *  - issuer = https://appleid.apple.com
 *  - audience = our iOS bundle id
 *  - not expired
 *
 * Returns the verified claims. Callers MUST trust `claims.sub` and
 * `claims.email` from this result rather than any user-supplied body fields.
 */
export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleIdentityClaims> {
  const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: APPLE_BUNDLE_ID,
  });
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Apple identity token missing subject");
  }
  return payload as AppleIdentityClaims;
}
