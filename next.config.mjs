/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false
  },
  // Explicitly forward these env vars so they are available in SSR Lambda
  // functions at runtime on AWS Amplify (not just during the build step).
  env: {
    BEDROCK_AGENT_ID: process.env.BEDROCK_AGENT_ID,
    BEDROCK_AGENT_ALIAS_ID: process.env.BEDROCK_AGENT_ALIAS_ID,
    BEDROCK_REGION: process.env.BEDROCK_REGION,
    BEDROCK_ACCESS_KEY_ID: process.env.BEDROCK_ACCESS_KEY_ID,
    BEDROCK_SECRET_ACCESS_KEY: process.env.BEDROCK_SECRET_ACCESS_KEY,
  }
};

export default nextConfig;
