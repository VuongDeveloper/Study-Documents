ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE user_invitations (
    id          BIGSERIAL PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    role        VARCHAR(20) NOT NULL,
    token       VARCHAR(64) UNIQUE NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_invitations_email ON user_invitations(email);
CREATE INDEX idx_user_invitations_token ON user_invitations(token);
