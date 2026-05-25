package com.ts.auth.service;

import com.ts.auth.dto.AdminCreateUserRequest;
import com.ts.auth.dto.AdminCreateUserResponse;
import com.ts.auth.dto.AdminUpdateUserRequest;
import com.ts.auth.dto.AdminUserResponse;
import com.ts.auth.entity.Role;
import com.ts.auth.entity.User;
import com.ts.auth.entity.UserInvitation;
import com.ts.auth.event.AdminUserPublisher;
import com.ts.auth.repository.UserInvitationRepository;
import com.ts.auth.repository.UserRepository;
import com.ts.common.dto.AdminProvisionedUserEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class AdminUserService {

    private static final String AUTH_METHOD_PASSWORD = "PASSWORD";
    private static final String AUTH_METHOD_GOOGLE = "GOOGLE";
    private static final String PROVIDER_LOCAL = "LOCAL";
    private static final String PROVIDER_GOOGLE = "GOOGLE";
    private static final int TEMP_PASSWORD_LENGTH = 12;
    private static final String TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    private static final int INVITATION_EXPIRY_DAYS = 7;

    private final UserRepository userRepository;
    private final UserInvitationRepository invitationRepository;
    private final PasswordEncoder passwordEncoder;
    private final AdminUserPublisher adminUserPublisher;

    public AdminCreateUserResponse createUser(AdminCreateUserRequest req) {
        Role role = parseRole(req.role());
        if (role == Role.ADMIN) {
            throw new IllegalArgumentException("Cannot create ADMIN via this endpoint");
        }

        if (userRepository.existsByEmail(req.email())) {
            throw new IllegalArgumentException("Email already in use");
        }
        if (invitationRepository.existsByEmail(req.email())) {
            throw new IllegalArgumentException("An invitation for this email is already pending");
        }

        return switch (req.authMethod().toUpperCase()) {
            case AUTH_METHOD_PASSWORD -> createPasswordUser(req, role);
            case AUTH_METHOD_GOOGLE -> createGoogleInvitation(req, role);
            default -> throw new IllegalArgumentException("Unsupported authMethod: " + req.authMethod());
        };
    }

    private AdminCreateUserResponse createPasswordUser(AdminCreateUserRequest req, Role role) {
        String tempPassword = generateTempPassword();

        User user = new User();
        user.setEmail(req.email());
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setFirstName(req.firstName());
        user.setLastName(req.lastName());
        user.setRole(role);
        user.setProvider(PROVIDER_LOCAL);
        user.setActivated(true);
        user.setMustChangePassword(true);
        userRepository.save(user);

        adminUserPublisher.publish(new AdminProvisionedUserEvent(
                req.email(),
                role.name(),
                AUTH_METHOD_PASSWORD,
                null,
                tempPassword
        ));

        return new AdminCreateUserResponse(req.email(), role.name(), AUTH_METHOD_PASSWORD, "USER_CREATED");
    }

    private AdminCreateUserResponse createGoogleInvitation(AdminCreateUserRequest req, Role role) {
        UserInvitation invitation = new UserInvitation();
        invitation.setEmail(req.email());
        invitation.setRole(role);
        invitation.setToken(UUID.randomUUID().toString());
        invitation.setExpiresAt(LocalDateTime.now().plusDays(INVITATION_EXPIRY_DAYS));
        invitationRepository.save(invitation);

        adminUserPublisher.publish(new AdminProvisionedUserEvent(
                req.email(),
                role.name(),
                AUTH_METHOD_GOOGLE,
                invitation.getToken(),
                null
        ));

        return new AdminCreateUserResponse(req.email(), role.name(), AUTH_METHOD_GOOGLE, "INVITATION_SENT");
    }

    @Transactional(readOnly = true)
    public Page<AdminUserResponse> listUsers(Pageable pageable) {
        return userRepository.findAll(pageable).map(this::toResponse);
    }

    public AdminUserResponse updateUserRole(Long id, AdminUpdateUserRequest req) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        Role role = parseRole(req.role());
        if (role == Role.ADMIN) {
            throw new IllegalArgumentException("Cannot assign ADMIN role via this endpoint");
        }
        user.setRole(role);
        userRepository.save(user);
        return toResponse(user);
    }

    public void deleteUser(Long id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (user.getRole() == Role.ADMIN) {
            throw new IllegalArgumentException("Cannot delete admin user");
        }
        userRepository.delete(user);
    }

    private Role parseRole(String role) {
        try {
            return Role.valueOf(role.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid role: " + role);
        }
    }

    private String generateTempPassword() {
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder(TEMP_PASSWORD_LENGTH);
        for (int i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
            sb.append(TEMP_PASSWORD_CHARS.charAt(random.nextInt(TEMP_PASSWORD_CHARS.length())));
        }
        return sb.toString();
    }

    private AdminUserResponse toResponse(User user) {
        return new AdminUserResponse(
                user.getId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getRole().name(),
                user.getProvider(),
                user.isActivated(),
                user.isMustChangePassword(),
                user.getCreatedAt()
        );
    }
}
