"use client";

import { Amplify } from "aws-amplify";

// Configure Amplify at module level so it runs before any auth calls.
// Uses NEXT_PUBLIC_ vars which are available in the browser bundle.
Amplify.configure(
  {
    Auth: {
      Cognito: {
        userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
        userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
      },
    },
  },
  { ssr: true }
);

export function ConfigureAmplify() {
  return null;
}
