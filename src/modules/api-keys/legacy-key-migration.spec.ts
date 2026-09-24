import { createHash } from 'node:crypto';

import { defaultKeyHasher } from '@better-auth/api-key';

// api_keys used to hold a hex SHA-256 digest of the key. The migration to the
// Better Auth API key plugin re-encodes that same digest as unpadded base64url,
// which is why keys issued before the cutover keep working without anyone
// knowing the raw key. If the plugin ever changes how it hashes, those keys stop
// authenticating and this fails first.
describe('legacy API key migration', () => {
  const rawKey = 'cms_a-key-handed-to-a-machine';

  it('re-encodes the stored digest into what the plugin now looks up', async () => {
    const legacyDigest = createHash('sha256').update(rawKey).digest('hex');

    // The migration's SQL, in Node:
    // rtrim(translate(encode(decode(key_hash,'hex'),'base64'),'+/','-_'),'=')
    const migrated = Buffer.from(legacyDigest, 'hex').toString('base64url');

    await expect(defaultKeyHasher(rawKey)).resolves.toBe(migrated);
  });

  it('stores nothing the raw key can be read back out of', async () => {
    const stored = await defaultKeyHasher(rawKey);

    expect(stored).not.toContain(rawKey);
    expect(stored).not.toBe(rawKey);
  });
});
