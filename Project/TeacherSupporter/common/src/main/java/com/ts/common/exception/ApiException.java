package com.ts.common.exception;

import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class ApiException extends RuntimeException {

    private final int status;
    private final LocalDateTime timestamp;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
        this.timestamp = LocalDateTime.now();
    }

    public ApiException(int status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
        this.timestamp = LocalDateTime.now();
    }
}
