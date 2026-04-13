package com.ts.auth.controller;

import com.ts.auth.dto.ActivationResponse;
import com.ts.auth.dto.LoginRequest;
import com.ts.auth.dto.LoginResponse;
import com.ts.auth.dto.RegisterRequest;
import com.ts.auth.dto.TokenRefreshRequest;
import com.ts.auth.dto.TotpSetupResponse;
import com.ts.auth.dto.TotpVerifyRequest;
import com.ts.auth.dto.UserResponse;
import com.ts.auth.service.AuthService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Authentication")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<ActivationResponse> register(@Valid @RequestBody RegisterRequest request) {
        ActivationResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/verify-2fa")
    public ResponseEntity<LoginResponse> verifyTwoFactor(@Valid @RequestBody TotpVerifyRequest request) {
        LoginResponse response = authService.verifyTwoFactor(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/activate")
    public ResponseEntity<Void> activate(@RequestParam String code) {
        authService.activate(code);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refreshToken(@Valid @RequestBody TokenRefreshRequest request) {
        LoginResponse response = authService.refreshToken(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestBody TokenRefreshRequest request) {
        authService.logout(request.refreshToken());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser(Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        UserResponse response = authService.getCurrentUser(userId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/me/enable-2fa")
    public ResponseEntity<TotpSetupResponse> setupTwoFactor(Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        TotpSetupResponse response = authService.setupTwoFactor(userId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/me/enable-2fa/verify")
    public ResponseEntity<Void> enableTwoFactor(Authentication authentication, @RequestParam String code) {
        Long userId = (Long) authentication.getPrincipal();
        authService.enableTwoFactor(userId, code);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/me/disable-2fa")
    public ResponseEntity<Void> disableTwoFactor(Authentication authentication) {
        Long userId = (Long) authentication.getPrincipal();
        authService.disableTwoFactor(userId);
        return ResponseEntity.ok().build();
    }
}
