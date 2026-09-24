Verification transcripts land in a subdirectory named after the feature id (`sign-up-and-session`, `api-keys`, `lead-ingest`, `lead-inbox`, `lead-fields`).

Cleanup must not delete these files. Do not commit their contents: they are gitignored and must not contain raw API keys, session tokens, or passwords.
