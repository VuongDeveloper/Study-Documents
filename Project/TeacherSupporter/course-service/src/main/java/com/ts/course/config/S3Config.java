package com.ts.course.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

/**
 * S3 clients pointed at a Garage endpoint (S3-compatible; replaced MinIO, see
 * docs/MIGRATION-GARAGE.md). Nothing here is Garage-specific: the same beans
 * work against MinIO or AWS S3 with different endpoint/region/credentials.
 *
 * <p>Path-style access ({@code http://host/bucket/key}) is required because
 * virtual-host style ({@code http://bucket.host/key}) needs wildcard DNS for
 * the endpoint, which neither Compose nor the homelab cluster provides.
 *
 * <p>The region is not an AWS region. SigV4 embeds it in the credential scope
 * of every signature, and Garage rejects signatures whose region differs from
 * its {@code s3_region} setting -- so {@code app.s3.region} must be
 * {@code garage} to match {@code deploy/garage/garage.toml}.
 */
@Configuration
public class S3Config {

    @Value("${app.s3.endpoint}")
    private String endpoint;

    @Value("${app.s3.public-endpoint}")
    private String publicEndpoint;

    @Value("${app.s3.region}")
    private String region;

    @Value("${app.s3.access-key}")
    private String accessKey;

    @Value("${app.s3.secret-key}")
    private String secretKey;

    private StaticCredentialsProvider credentialsProvider() {
        return StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey));
    }

    @Bean
    public S3Client s3Client() {
        return S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.of(region))
                .credentialsProvider(credentialsProvider())
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }

    @Bean
    public S3Presigner s3Presigner() {
        return S3Presigner.builder()
                .endpointOverride(URI.create(publicEndpoint))
                .region(Region.of(region))
                .credentialsProvider(credentialsProvider())
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }
}
