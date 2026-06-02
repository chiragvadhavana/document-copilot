// Local dev server — runs the same Express app the Lambda runs (includes /copilotkit).
//   npx tsx scripts/serve.ts
import { makeApp } from '../src/app.js';

const PORT = Number(process.env.PORT ?? 3001);
makeApp().listen(PORT, () => console.log(`document-copilot server on http://localhost:${PORT}`));
