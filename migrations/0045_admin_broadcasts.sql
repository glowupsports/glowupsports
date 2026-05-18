-- Task #1935 — admin_broadcasts table
--
-- Persists broadcast history so admins can review past messages and delivery stats.
-- tokens_sent tracks how many push-notification tokens actually received the message.
--
-- All statements use IF NOT EXISTS so this migration is safe to re-run.

CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id               VARCHAR     PRIMARY KEY,
  academy_id       VARCHAR     NOT NULL,
  message          TEXT        NOT NULL,
  title            VARCHAR(100) NOT NULL DEFAULT 'Academy Announcement',
  audience         VARCHAR(30) NOT NULL,
  series_id        VARCHAR,
  recipient_count  INTEGER     NOT NULL DEFAULT 0,
  tokens_sent      INTEGER     NOT NULL DEFAULT 0,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by          VARCHAR     NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_academy_sent
  ON admin_broadcasts (academy_id, sent_at DESC);
