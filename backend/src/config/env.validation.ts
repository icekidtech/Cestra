import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().integer().positive().required(),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),

  // Auth
  JWT_SECRET: Joi.string().required(),

  // Application
  APP_PORT: Joi.number().integer().positive().default(3000),
  APP_BASE_URL: Joi.string().uri().required(),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().integer().positive().required(),

  // Plaid
  PLAID_CLIENT_ID: Joi.string().required(),
  PLAID_SECRET: Joi.string().required(),

  // Persona KYC
  PERSONA_API_KEY: Joi.string().required(),

  // CORS
  CORS_ORIGINS: Joi.string().required(),

  // Sui Blockchain Integration
  SUI_NETWORK: Joi.string()
    .valid('devnet', 'testnet', 'mainnet')
    .default('testnet'),
  SUI_RPC_URL: Joi.string().uri().required(),
  SUI_PRIVATE_KEY: Joi.string().required(),
  SUI_PACKAGE_ID: Joi.string().required(),

  // zkLogin / Google OAuth
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  ZKLOGIN_SALT: Joi.string().optional(),

  // Compliance (optional, for OFAC/AML checking)
  OFAC_API_KEY: Joi.string().optional(),
  OFAC_API_URL: Joi.string().uri().optional(),

  // Webhook Configuration
  WEBHOOK_SECRET: Joi.string().required(),
}).options({
  // Collect all errors rather than stopping at the first missing key
  abortEarly: false,
  // Allow unknown keys (e.g. OS-level env vars) without failing
  allowUnknown: true,
});
