import type { Block } from './blog.types';
import { parseBlocks } from './block-registry';

const STEPS = [
  'Read the meter in this order.',
  '',
  '1. Photograph the dials',
  '   - Include the meter number',
  '2. Enter the **digits** left to right',
  '3. Submit before midnight',
].join('\n');

const RATES = ['- Weekday energy', '- Weekend energy'].join('\n');

/** The utility billing article: eight sections, numbered steps, and two FAQ pairs. */
export function utilityBillingBlocks(): Block[] {
  return parseBlocks(
    [
      { id: 'overview', kind: 'heading', level: 2, text: 'Overview' },
      {
        id: 'overview-body',
        kind: 'rich_text',
        markdown: 'This guide covers how a utility account is billed.',
      },
      { id: 'readings', kind: 'heading', level: 2, text: 'Readings' },
      { id: 'submitting', kind: 'heading', level: 2, text: 'Submitting a reading' },
      { id: 'steps', kind: 'rich_text', markdown: STEPS },
      { id: 'rates', kind: 'heading', level: 2, text: 'Rates' },
      { id: 'rate-list', kind: 'rich_text', markdown: RATES },
      { id: 'cycle', kind: 'heading', level: 2, text: 'Billing cycle' },
      { id: 'payments', kind: 'heading', level: 2, text: 'Payments' },
      { id: 'readings-again', kind: 'heading', level: 2, text: 'Readings' },
      { id: 'questions', kind: 'heading', level: 2, text: 'Questions' },
      { id: 'due', kind: 'heading', level: 3, text: 'When is my bill due?' },
      {
        id: 'due-answer',
        kind: 'rich_text',
        markdown: 'Bills go out on the first business day.',
      },
      { id: 'miss', kind: 'heading', level: 3, text: 'What if I miss a reading?' },
      {
        id: 'miss-answer',
        kind: 'rich_text',
        markdown: 'We estimate the month and true it up on the next reading.',
      },
    ],
    new Map(),
  );
}
