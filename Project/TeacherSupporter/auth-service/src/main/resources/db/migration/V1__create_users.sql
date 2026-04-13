CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    role            VARCHAR(20) NOT NULL DEFAULT 'STUDENT',
    provider        VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
    provider_id     VARCHAR(255),
    totp_secret     VARCHAR(255),
    totp_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    activated       BOOLEAN NOT NULL DEFAULT FALSE,
    activation_code VARCHAR(64),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
