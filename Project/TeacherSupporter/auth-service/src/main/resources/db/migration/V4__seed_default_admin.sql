INSERT INTO users (
    email,
    password_hash,
    first_name,
    last_name,
    role,
    provider,
    activated,
    must_change_password
) VALUES (
    'admin@teachersupporter.com',
    '$2b$10$ob6aSw3IcqmKFoKg6HuuK.oFSuQqllPqHfyq58T0pQCbfHYZFaste',
    'System',
    'Admin',
    'ADMIN',
    'LOCAL',
    TRUE,
    FALSE
);
