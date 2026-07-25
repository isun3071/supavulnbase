-- PostgREST reads the JWT secret from these database-level settings.
alter database postgres set "app.settings.jwt_secret" to 'super-secret-jwt-token-with-at-least-32-characters-long';
alter database postgres set "app.settings.jwt_exp" to 3600;
