// `npm run flags:init`: copy config/flags.override.example.json → config/flags.override.json (never overwrites).
import { copyFile, constants } from 'node:fs/promises';

try {
  await copyFile('config/flags.override.example.json', 'config/flags.override.json', constants.COPYFILE_EXCL);
  console.log('created config/flags.override.json — edit it and set checkedAt to when you read the live values');
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === 'EEXIST') console.log('config/flags.override.json already exists; left unchanged');
  else throw e;
}
