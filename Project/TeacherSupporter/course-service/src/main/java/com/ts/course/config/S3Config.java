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
 * S3 clients pointed at an Alarik endpoint (S3-compatible; replaced MinIO, see
 * docs/MIGRATION-ALARIK.md). Path-style access is required because a self-hosted
 * store without wildcard DNS cannot resolve virtual-host-style bucket names.
 * Nothing here is Alarik-specific: endpoint, region and credentials come from
 * configuration, which is the whole point of coding against the S3 API.
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
