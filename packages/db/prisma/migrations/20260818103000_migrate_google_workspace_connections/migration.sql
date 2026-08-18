-- Migrate legacy Google Workspace connections to the unified google-drive provider.
UPDATE "app_connections"
SET "provider" = 'google-drive'
WHERE "provider" IN ('google-docs', 'google-sheets', 'google-slides');
