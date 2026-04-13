package com.ts.common.security;

public final class JwtConstants {

    private JwtConstants() {
        // Prevent instantiation
    }

    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_USER_ROLE = "X-User-Role";
    public static final String CLAIM_ROLE = "role";
    public static final String CLAIM_EMAIL = "email";
    public static final String CLAIM_TWO_FACTOR_PENDING = "twoFactorPending";
}
