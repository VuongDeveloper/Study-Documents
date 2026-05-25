package com.ts.auth.config;

import com.ts.auth.dto.LoginResponse;
import com.ts.auth.entity.Role;
import com.ts.auth.entity.User;
import com.ts.auth.entity.UserInvitation;
import com.ts.auth.event.UserActivatedPublisher;
import com.ts.auth.repository.UserInvitationRepository;
import com.ts.auth.repository.UserRepository;
import com.ts.auth.service.AuthService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class OAuth2LoginSuccessHandler implements AuthenticationSuccessHandler {

    private static final String PROVIDER_GOOGLE = "GOOGLE";

    private final UserRepository userRepository;
    private final UserInvitationRepository invitationRepository;
    private final AuthService authService;
    private final UserActivatedPublisher userActivatedPublisher;

    @Value("${app.oauth2.success-redirect-uri}")
    private String successRedirectUri;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {
        OAuth2User oauth2User = (OAuth2User) authentication.getPrincipal();
        String providerId = oauth2User.getAttribute("sub");
        String email = oauth2User.getAttribute("email");
        String givenName = oauth2User.getAttribute("given_name");
        String familyName = oauth2User.getAttribute("family_name");

        User user = userRepository.findByProviderAndProviderId(PROVIDER_GOOGLE, providerId)
                .or(() -> userRepository.findByEmail(email))
                .map(existing -> linkProviderIfNeeded(existing, providerId))
                .orElseGet(() -> {
                    Role role = consumePendingInvitation(email).orElse(Role.STUDENT);
                    User created = createUser(email, givenName, familyName, providerId, role);
                    userActivatedPublisher.publish(created);
                    return created;
                });

        LoginResponse tokens = authService.createTokens(user);

        String redirectUrl = UriComponentsBuilder.fromUriString(successRedirectUri)
                .queryParam("accessToken", tokens.accessToken())
                .queryParam("refreshToken", tokens.refreshToken())
                .build()
                .toUriString();

        response.sendRedirect(redirectUrl);
    }

    private java.util.Optional<Role> consumePendingInvitation(String email) {
        return invitationRepository.findByEmailAndAcceptedAtIsNull(email)
                .filter(inv -> inv.getExpiresAt().isAfter(LocalDateTime.now()))
                .map(inv -> {
                    inv.setAcceptedAt(LocalDateTime.now());
                    invitationRepository.save(inv);
                    return inv.getRole();
                });
    }

    private User linkProviderIfNeeded(User user, String providerId) {
        if (!PROVIDER_GOOGLE.equals(user.getProvider())) {
            user.setProvider(PROVIDER_GOOGLE);
            user.setProviderId(providerId);
            return userRepository.save(user);
        }
        return user;
    }

    private User createUser(String email, String givenName, String familyName, String providerId, Role role) {
        User user = new User();
        user.setEmail(email);
        user.setFirstName(givenName);
        user.setLastName(familyName);
        user.setRole(role);
        user.setProvider(PROVIDER_GOOGLE);
        user.setProviderId(providerId);
        user.setActivated(true);
        return userRepository.save(user);
    }
}
