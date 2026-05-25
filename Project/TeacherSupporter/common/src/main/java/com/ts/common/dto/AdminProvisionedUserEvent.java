package com.ts.common.dto;

public record AdminProvisionedUserEvent(
        String email,
        String role,
        String authMethod,
        String inviteToken,
        String tempPassword
) {}
