import { CognitoJwtVerifier } from "aws-jwt-verify";

// Lazily initialized to avoid crashing at module load if env vars are missing
let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!_verifier) {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (!userPoolId || !clientId) {
      throw new Error(
        "Missing NEXT_PUBLIC_COGNITO_USER_POOL_ID or NEXT_PUBLIC_COGNITO_CLIENT_ID environment variables"
      );
    }

    _verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "access",
      clientId,
    });
  }
  return _verifier;
}

/**
 * Verifies the Cognito access token from the Authorization header.
 * Returns the user's unique sub (userId) if valid.
 * Throws with a descriptive message if invalid or missing.
 */
export async function verifyToken(authHeader: string | null): Promise<string> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = authHeader.slice(7);
  const payload = await getVerifier().verify(token);
  return payload.sub;
}
