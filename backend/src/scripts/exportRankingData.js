/**
 * Exports logged search impressions as training data for the ranker.
 *
 *   npm run export:ranking           # all events
 *   npm run export:ranking -- 30     # last 30 days
 *
 * Writes ai-service/data/ranking_events.csv (gitignored — regenerate from the database),
 * then: cd ai-service && python scripts/train_ranker.py
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { exportTrainingRows } from '../services/ranking.service.js';

const OUT = path.resolve(import.meta.dirname, '../../../ai-service/data/ranking_events.csv');

function toCsv(rows) {
  const columns = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => escape(r[c])).join(','))].join('\n');
}

async function run() {
  const days = Number(process.argv[2]);
  const since = Number.isFinite(days) ? new Date(Date.now() - days * 86_400_000) : undefined;

  await connectDB(env.MONGODB_URI);
  const rows = await exportTrainingRows({ since });

  if (!rows.length) {
    console.log('No search impressions logged yet — use the app (search, open profiles, hire) and run this again.');
    await disconnectDB();
    return;
  }

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, toCsv(rows), 'utf8');

  const positives = {
    opened: rows.filter((r) => r.opened).length,
    hire_intent: rows.filter((r) => r.hire_intent).length,
    hired: rows.filter((r) => r.hired).length,
  };
  const impressions = new Set(rows.map((r) => r.impression_id)).size;

  console.log(`Exported ${rows.length} rows from ${impressions} searches -> ${OUT}`);
  console.log(`Positives: ${positives.opened} opened, ${positives.hire_intent} hire intent, ${positives.hired} hired`);
  if (positives.opened < 50) {
    console.log('\nNot enough signal to train a ranker yet (want 50+ opens). The model keeps using the hand-set weights until then.');
  }

  await disconnectDB();
}

run().catch(async (err) => {
  console.error('Export failed:', err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
