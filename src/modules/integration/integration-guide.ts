import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// nest-cli.json copies the markdown next to the compiled file, so one path works
// from src in tests and from dist in production.
const TEMPLATE = readFileSync(join(__dirname, 'integration-guide.md'), 'utf8');

const BASE_URL_TOKEN = '{{apiBaseUrl}}';

/** The public integration guide, with this API's own address filled in. */
export function renderIntegrationGuide(apiBaseUrl: string): string {
  return TEMPLATE.replaceAll(BASE_URL_TOKEN, apiBaseUrl);
}
