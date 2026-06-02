// Local end-to-end agent test (not bundled): npx tsx scripts/try-agent.ts "question"
import { runAgent } from '../src/agent/graph.js';

async function main() {
  const q = process.argv.slice(2).join(' ') || 'How tight should the drive chain be?';
  console.log('Q:', q, '\n');
  const r = await runAgent(q);
  console.log('ANSWER:\n', r.answer, '\n');
  console.log('CITATIONS:', JSON.stringify(r.citations));
  console.log('IMAGES:', r.images.map((i) => ({ page: i.page, caption: i.caption, key: i.s3_key })));
  console.log('META:', r.provider, r.model);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
