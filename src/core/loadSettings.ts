// Side-effect import replacing `dotenv/config`: loads only the SETTINGS keys of .env (see dotenv.ts).
import { loadSettingsEnv } from './dotenv.js';

loadSettingsEnv();
