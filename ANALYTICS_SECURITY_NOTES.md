# Analytics Security Notes

- NeuralScribe stores analytics connection status, display labels, scopes, and optional `tokenReference` values only.
- Raw OAuth access tokens and refresh tokens are intentionally not persisted in the registry database.
- `tokenReference` is reserved for a future secure-secret-store integration and must not contain the token value itself.
- Until secure token storage and provider-specific OAuth flows are implemented, analytics ingestion should use manual import or clearly marked placeholders.
