-- Migration 019: Create notifications table
-- Stores pending/sent/failed notifications for users and admins

CREATE TABLE notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id),
  channel    TEXT        NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  event      TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  status     TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at    TIMESTAMPTZ
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read ALL notifications
CREATE POLICY "admins can read all notifications"
  ON notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- No client-side INSERT / UPDATE / DELETE — all writes go through service-role client

-- Indexes
CREATE INDEX idx_notifications_user_id   ON notifications(user_id);
CREATE INDEX idx_notifications_status    ON notifications(status);
CREATE INDEX idx_notifications_event     ON notifications(event);
CREATE INDEX idx_notifications_channel   ON notifications(channel);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
