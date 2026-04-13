package com.ts.auth.service;

import com.ts.auth.dto.ActivationResponse;
import com.ts.auth.dto.LoginRequest;
import com.ts.auth.dto.LoginResponse;
import com.ts.auth.dto.RegisterRequest;
import com.ts.auth.dto.TokenRefreshRequest;
import com.ts.auth.dto.TotpSetupResponse;
import com.ts.auth.dto.TotpVerifyRequest;
import com.ts.auth.dto.UserResponse;
import com.ts.auth.entity.RefreshToken;
import com.ts.auth.entity.Role;
import com.ts.auth.entity.User;
import com.ts.auth.event.UserRegisteredPublisher;
import com.ts.auth.repository.RefreshTokenRepository;
import com.ts.auth.repository.UserRepository;
import com.ts.common.dto.UserRegisteredEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final TotpService totpService;
    private final UserRegisteredPublisher userRegisteredPublisher;

    public ActivationResponse register(RegisterRequest req) {
        if (userRepository.existsByEmail(req.email())) {
            throw new IllegalArgumentException("Email already registered");
        }

        User user = new User();
        user.setEmail(req.email());
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setFirstName(req.firstName());
        user.setLastName(req.lastName());
        user.setRole(Role.valueOf(req.role().toUpperCase()));
        user.setActivationCode(UUID.randomUUID().toString());
        user.setActivated(false);

        user = userRepository.save(user);

        if ("EMAIL".equalsIgnoreCase(req.activationMethod())) {
            UserRegisteredEvent event = new UserRegisteredEvent(
                    String.valueOf(user.getId()),
                    user.getEmail(),
                    user.getFirstName(),
                    user.getActivationCode(),
                    req.activationMethod()
            );
            userRegisteredPublisher.publish(event);
            return new ActivationResponse("Registration successful. Check your email to activate your account.", null);
        } else {
            String activationLink = "/activate?code=" + user.getActivationCode();
            return new ActivationResponse("Registration successful. Use the activation link to activate your account.", activationLink);
        }
    }

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest req) {
        User user = userRepository.findByEmail(req.email())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid email or password");
        }

        if (!user.isActivated()) {
            throw new IllegalStateException("Account is not activated");
        }

        if (user.isTotpEnabled()) {
            String tempToken = jwtService.generateTempToken(user);
            return new LoginResponse(null, null, true, tempToken);
        }

        return createTokens(user);
    }

    public LoginResponse verifyTwoFactor(TotpVerifyRequest req) {
        Long userId = jwtService.extractUserId(req.tempToken());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (!totpService.verifyCode(user.getTotpSecret(), req.code())) {
            throw new IllegalArgumentException("Invalid TOTP code");
        }

        return createTokens(user);
    }

    public LoginResponse refreshToken(TokenRefreshRequest req) {
        RefreshToken refreshToken = refreshTokenRepository.findByToken(req.refreshToken())
                .orElseThrow(() -> new IllegalArgumentException("Invalid refresh token"));

        if (refreshToken.getExpiresAt().isBefore(Instant.now())) {
            refreshTokenRepository.delete(refreshToken);
            throw new IllegalArgumentException("Refresh token has expired");
        }

        String accessToken = jwtService.generateAccessToken(refreshToken.getUser());
        return new LoginResponse(accessToken, refreshToken.getToken(), false, null);
    }

    public void activate(String code) {
        User user = userRepository.findByActivationCode(code)
                .orElseThrow(() -> new IllegalArgumentException("Invalid activation code"));

        user.setActivated(true);
        user.setActivationCode(null);
        userRepository.save(user);
    }

    public void logout(String refreshToken) {
        refreshTokenRepository.deleteByToken(refreshToken);
    }

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        return toUserResponse(user);
    }

    public TotpSetupResponse setupTwoFactor(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String secret = totpService.generateSecret();
        user.setTotpSecret(secret);
        userRepository.save(user);

        String qrCodeUri = totpService.generateQrCodeUri(secret, user.getEmail());
        return new TotpSetupResponse(secret, qrCodeUri);
    }

    public void enableTwoFactor(Long userId, String code) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (user.getTotpSecret() == null) {
            throw new IllegalStateException("TOTP secret not set up. Call setup first.");
        }

        if (!totpService.verifyCode(user.getTotpSecret(), code)) {
            throw new IllegalArgumentException("Invalid TOTP code");
        }

        user.setTotpEnabled(true);
        userRepository.save(user);
    }

    public void disableTwoFactor(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        user.setTotpEnabled(false);
        user.setTotpSecret(null);
        userRepository.save(user);
    }

    private LoginResponse createTokens(User user) {
        String accessToken = jwtService.generateAccessToken(user);
        String refreshTokenValue = jwtService.generateRefreshTokenValue();

        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setUser(user);
        refreshToken.setToken(refreshTokenValue);
        refreshToken.setExpiresAt(Instant.now().plusMillis(jwtService.getRefreshTokenExpiryMs()));
        refreshToken.setCreatedAt(Instant.now());
        refreshTokenRepository.save(refreshToken);

        return new LoginResponse(accessToken, refreshTokenValue, false, null);
    }

    private UserResponse toUserResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getRole().name(),
                user.getProvider(),
                user.isTotpEnabled(),
                user.isActivated()
        );
    }
}
