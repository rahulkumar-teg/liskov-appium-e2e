// Android account / navigation ids (Compose testTags, bare resource-ids) — seen on lamarr 4.108.0 economist debug
// (main ac10c30a17) on the Pixel_10_Pro emulator, 29 Oct 2026. Home ▸ Menu ▸ Settings ▸ Log in.
export const androidAccount = {
  todayTab: 'android=new UiSelector().resourceId("liskov-text").text("Today")',
  homeColumn: 'id=collection-content-lazy-column',
  menuButton: 'id=menu-button',
  menuScreen: 'id=menu-screen',
  settingsButton: 'id=settings-button',
  settingsScreen: 'id=settings-screen',
  /** Shown in the Settings header only when logged out. */
  loginButton: 'id=login-button',
  back: 'android=new UiSelector().description("Go Back")',
} as const;

/** The hosted login page (Chrome Custom Tab on myaccount.economist.com) — web accessibility nodes, no ids. */
export const androidLoginPage = {
  pkg: 'com.android.chrome',
  heading: 'android=new UiSelector().textContains("Log into your account")',
  email: '//android.widget.EditText[@password="false"]',
  password: '//android.widget.EditText[@password="true"]',
  submit: '//android.widget.Button[@text="Log in"]',
} as const;
