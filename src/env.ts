/**
 * Environment Variables
 *
 * Server-side and client-side environment variables
 */

export const env = {
  // Iron Finance
  IRON_ENVIRONMENT: (process.env.IRON_ENVIRONMENT as "production" | "sandbox") || "sandbox",
  IRON_API_KEY: process.env.IRON_API_KEY || "",

  // Dynamic
  NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "",

  // Velocity
  VELOCITY_API_KEY: process.env.VELOCITY_API_KEY || "",
  VELOCITY_CUSTOMER_ENTITY_ID: process.env.VELOCITY_CUSTOMER_ENTITY_ID || "",
  VELOCITY_OPERATOR_ENTITY_ID: process.env.VELOCITY_OPERATOR_ENTITY_ID || "",
  VELOCITY_BASE_URL: process.env.VELOCITY_BASE_URL || "https://api-staging.velocity.xyz",

  // LightSpark Grid
  LIGHTSPARK_CLIENT_ID: process.env.LIGHTSPARK_CLIENT_ID || "",
  LIGHTSPARK_CLIENT_SECRET: process.env.LIGHTSPARK_CLIENT_SECRET || "",

  // OpenFX
  OPENFX_ORG_ID: process.env.OPENFX_ORG_ID || "",
  OPENFX_API_KEY_ID: process.env.OPENFX_API_KEY_ID || "",
  OPENFX_PRIVATE_KEY: (process.env.OPENFX_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  OPENFX_BASE_URL: process.env.OPENFX_BASE_URL || "https://api.openfx.com",
  OPENFX_APP_MODE: process.env.OPENFX_APP_MODE || "SANDBOX",
} as const;
