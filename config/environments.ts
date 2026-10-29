// Public endpoints only (plan §4.2). From ios Packages/Environment/.../EnvironmentConfig.swift and
// android core/environment/*EnvironmentProvider.kt.
export type Env = 'stage' | 'prod';

export const endpoints = {
  stage: {
    graphql: 'https://api-stage.economist.com/teg/content/b2c-mobile/cp2-gateway/graphql',
    mobileAssets: 'https://stage-mobileapp.economist.com/mobile-assets',
    login: 'https://stage.economist.com/api/auth/login',
    loginPage: 'https://stage.economist.com/login', // §4.27 guard [ASSUMPTION: same page the app opens]
  },
  prod: {
    graphql: 'https://api.economist.com/teg/content/b2c-mobile/cp2-gateway/graphql', // android ProdEnvironmentProvider.kt:11 (read 2026-10-28)
    mobileAssets: 'https://mobileapp.economist.com/mobile-assets',
    login: 'https://www.economist.com/api/auth/login',
    loginPage: 'https://www.economist.com/login',
  },
} as const satisfies Record<Env, { graphql: string | null; mobileAssets: string; login: string; loginPage: string }>;

export type Endpoints = (typeof endpoints)[Env];
