import { BLOCK_KINDS } from './block-registry';
import { DraftRejected, type BlockId } from './blog.types';

const id = 'block-1' as BlockId;

describe('BLOCK_KINDS', () => {
  it('turns markdown into stored doc and sanitized html', () => {
    const block = BLOCK_KINDS.rich_text.parse(
      { markdown: 'We are **hiring**.' },
      new Map(),
      id,
    );

    expect(block.kind).toBe('rich_text');
    expect(block.html).toContain('<strong>hiring</strong>');
    expect(block).not.toHaveProperty('markdown');
  });

  it('rejects rich text that sends markdown and a doc', () => {
    expect(() =>
      BLOCK_KINDS.rich_text.parse(
        { markdown: 'Hi', doc: { type: 'doc', content: [] } },
        new Map(),
        id,
      ),
    ).toThrow(DraftRejected);
  });
});
