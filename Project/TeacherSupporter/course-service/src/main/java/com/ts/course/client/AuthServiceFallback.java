package com.ts.course.client;

import com.ts.common.dto.UserDto;
import org.springframework.stereotype.Component;

@Component
public class AuthServiceFallback implements AuthServiceClient {

    @Override
    public UserDto getUserById(Long id) {
        return null;
    }
}
