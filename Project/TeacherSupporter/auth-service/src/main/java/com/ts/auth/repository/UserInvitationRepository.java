package com.ts.auth.repository;

import com.ts.auth.entity.UserInvitation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserInvitationRepository extends JpaRepository<UserInvitation, Long> {

    Optional<UserInvitation> findByToken(String token);

    Optional<UserInvitation> findByEmailAndAcceptedAtIsNull(String email);

    boolean existsByEmail(String email);
}
