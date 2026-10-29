// Plan secrets → references (§4.25). REFERENCES ONLY, never values.
// env:NAME = key in the framework .env (copied from mobile-liskov's .env, git-ignored) or the real environment.
// Key names verified 2026-10-28 against mobile-liskov android core/environment/*EnvironmentProvider.kt and
// app/di/AppModule.kt (read-only). Account credentials are NOT in mobile-liskov's .env and stay op:// (config/accounts.ts).
import type { Env } from './environments.js';

export interface EnvSecrets {
  /** HMAC-SHA256 key for the mobile-assets host (edition PDFs/zips): `downloadHmacSignatureKey`. */
  downloadHmacKey: string;
  /** Amplitude Experiment client DEPLOYMENT key (`amplitudeApiKey` → Experiment.initialize): puwilo_* reads. */
  amplitudeDeploymentKey: string;
  /** Amplitude project API key (AmplitudeEngagement), not used by the framework. */
  amplitudeProjectApiKey: string;
  /** Not secret, but kept beside the key: EU | US. */
  amplitudeServerZone: string;
  /** Firebase CLIENT config (Android app). Firebase RC REST needs a service account, which is NOT in .env. */
  firebaseProjectId: string;
  firebaseApiKey: string;
}

export const envSecrets: Readonly<Record<Env, EnvSecrets>> = {
  stage: {
    downloadHmacKey: 'env:STAGE_DOWNLOAD_HMAC_KEY',
    amplitudeDeploymentKey: 'env:STAGE_AMPLITUDE_API_KEY',
    amplitudeProjectApiKey: 'env:STAGE_AMPLITUDE_PROJECT_API_KEY',
    amplitudeServerZone: 'env:STAGE_AMPLITUDE_SERVER_ZONE',
    firebaseProjectId: 'env:STAGE_LAMARR_FIREBASE_PROJECT_ID',
    firebaseApiKey: 'env:STAGE_LAMARR_FIREBASE_API_KEY',
  },
  prod: {
    downloadHmacKey: 'env:DOWNLOAD_HMAC_KEY',
    amplitudeDeploymentKey: 'env:AMPLITUDE_API_KEY',
    amplitudeProjectApiKey: 'env:AMPLITUDE_PROJECT_API_KEY',
    amplitudeServerZone: 'env:AMPLITUDE_SERVER_ZONE',
    firebaseProjectId: 'env:LAMARR_FIREBASE_PROJECT_ID',
    firebaseApiKey: 'env:LAMARR_FIREBASE_API_KEY',
  },
};

/** Not in mobile-liskov's .env: the test-account credentials (USERn_* in this framework's .env; op:// refs for the
 *  shared automation accounts in accounts.ts) and a Firebase service account for Remote Config REST (§9.2 a). */
export const NOT_IN_DOTENV = ['automation account usernames/passwords', 'Firebase Remote Config service account'] as const;
