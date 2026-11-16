CREATE TABLE IF NOT EXISTS profile_objects (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  etag TEXT NOT NULL
);
