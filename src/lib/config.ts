/**
 * Configuration & Environment Variable Validator
 * Categorizes public vs server-only credentials, validates required configs,
 * and ensures safe fallback execution without exposing keys.
 */

export interface AppConfig {
  env: "development" | "preview" | "production";
  authMode: "clerk" | "mock_dev_only";
  clerk: {
    secretKey?: string;
    publishableKey?: string;
    webhookSecret?: string;
    isConfigured: boolean;
  };
  r2: {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucket: string;
    region: string;
    endpoint?: string;
    isConfigured: boolean;
  };
  brevo: {
    apiKey?: string;
    senderEmail?: string;
    senderName?: string;
    templates: {
      welcome?: string;
      taxSubmitted?: string;
      taxApproved?: string;
      taxRejected?: string;
      taxReplacementReq?: string;
    };
    devRecipientOverride?: string;
    isConfigured: boolean;
  };
  stripe: {
    secretKey?: string;
    publishableKey?: string;
    webhookSecret?: string;
    isConfigured: boolean;
  };
  posthog: {
    apiKey?: string;
    host?: string;
    isConfigured: boolean;
  };
  sentry: {
    dsn?: string;
    environment: string;
    isConfigured: boolean;
  };
  hospitable: {
    pat?: string;
    isConfigured: boolean;
  };
}

export function loadAppConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || "development") as AppConfig["env"];
  const isProd = nodeEnv === "production";

  const authModeSetting = process.env.NEXT_PUBLIC_AUTH_MODE || "clerk";
  const authMode: AppConfig["authMode"] = isProd ? "clerk" : (authModeSetting === "mock_dev_only" ? "mock_dev_only" : "clerk");

  const clerkSecret = process.env.CLERK_SECRET_KEY;
  const clerkPub = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  // Cloudflare R2 Credentials
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket = process.env.R2_BUCKET || "hhh-private-tax-documents";
  const r2Region = process.env.R2_REGION || "auto";
  const r2Endpoint = process.env.R2_ENDPOINT || (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : undefined);

  const brevoKey = process.env.BREVO_API_KEY;
  const brevoSender = process.env.BREVO_SENDER_EMAIL;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripePub = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const hospitablePat = process.env.HOSPITABLE_PAT;

  return {
    env: nodeEnv,
    authMode,
    clerk: {
      secretKey: clerkSecret,
      publishableKey: clerkPub,
      webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
      isConfigured: Boolean(clerkSecret && clerkPub)
    },
    r2: {
      accountId: r2AccountId,
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      bucket: r2Bucket,
      region: r2Region,
      endpoint: r2Endpoint,
      isConfigured: Boolean(r2AccessKeyId && r2SecretAccessKey && (r2AccountId || r2Endpoint))
    },
    brevo: {
      apiKey: brevoKey,
      senderEmail: brevoSender,
      senderName: process.env.BREVO_SENDER_NAME || "Hidden Honey Homes",
      templates: {
        welcome: process.env.BREVO_TEMPLATE_WELCOME,
        taxSubmitted: process.env.BREVO_TEMPLATE_TAX_SUBMITTED,
        taxApproved: process.env.BREVO_TEMPLATE_TAX_APPROVED,
        taxRejected: process.env.BREVO_TEMPLATE_TAX_REJECTED,
        taxReplacementReq: process.env.BREVO_TEMPLATE_TAX_REPLACEMENT_REQ
      },
      devRecipientOverride: process.env.BREVO_DEV_RECIPIENT_OVERRIDE,
      isConfigured: Boolean(brevoKey && brevoSender)
    },
    stripe: {
      secretKey: stripeKey,
      publishableKey: stripePub,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      isConfigured: Boolean(stripeKey && stripePub)
    },
    posthog: {
      apiKey: posthogKey,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
      isConfigured: Boolean(posthogKey)
    },
    sentry: {
      dsn: sentryDsn,
      environment: nodeEnv,
      isConfigured: Boolean(sentryDsn)
    },
    hospitable: {
      pat: hospitablePat,
      isConfigured: Boolean(hospitablePat)
    }
  };
}

export const appConfig = loadAppConfig();
