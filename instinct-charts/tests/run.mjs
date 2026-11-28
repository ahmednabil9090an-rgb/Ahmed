#!/usr/bin/env node
/* مشغّل الاختبارات:  npm test  */

import { report } from './harness.mjs';

await import('./indicators.test.mjs');
await import('./ict.test.mjs');
await import('./volume-profile.test.mjs');

process.exit(report() === 0 ? 0 : 1);
