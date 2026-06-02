// Lambda entry: wraps the Express app (the CopilotKit runtime) for API
// Gateway via serverless-http. Bundled to build/query.js; container CMD = query.handler.
import serverless from 'serverless-http';
import { makeApp } from '../app.js';

export const handler = serverless(makeApp());
