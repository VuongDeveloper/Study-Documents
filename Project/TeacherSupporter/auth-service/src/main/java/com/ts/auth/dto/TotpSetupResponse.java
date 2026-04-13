package com.ts.auth.dto;

public record TotpSetupResponse(
        String secret,
        String qrCodeUri
) {}
