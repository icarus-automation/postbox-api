// Settings for the Better Auth API key plugin, kept out of auth.ts so a guard
// can name the configuration without constructing the auth instance.

// The plugin runs one unnamed configuration, which makes it the one the plugin
// falls back to. Naming it would mean threading the name through every call, and
// an unresolved name silently falls back here anyway. Every key it mints is
// organization-owned; a second configuration would have to revisit ApiKeyGuard,
// which trusts a verified key's referenceId to be an organization.
export const ORGANIZATION_API_KEY_CONFIG_ID = 'default';

export const API_KEY_PREFIX = 'cms_';
// Long enough to stay recognisable in a list, short enough to stay useless.
export const API_KEY_START_LENGTH = 12;
export const API_KEY_NAME_MAX_LENGTH = 100;
