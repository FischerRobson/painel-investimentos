package br.com.painel.service;

import br.com.painel.config.AppConfig;
import br.com.painel.dto.AuthConfig;
import br.com.painel.util.ProviderCall;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import software.amazon.awssdk.services.ssm.SsmClient;

import java.io.IOException;
import java.io.UncheckedIOException;

// The Cognito client id comes from SSM instead of an environment variable: the app client depends on the function URL,
// so passing it to the function would create a CloudFormation cycle. Read on the first request (after SnapStart restore).
@ApplicationScoped
public class AuthConfigService {

    private final AppConfig config;
    private final Instance<SsmClient> ssm;
    private final ObjectMapper mapper;

    public AuthConfigService(AppConfig config, Instance<SsmClient> ssm, ObjectMapper mapper) {
        this.config = config;
        this.ssm = ssm;
        this.mapper = mapper;
    }

    @CacheResult(cacheName = "auth-config")
    public AuthConfig get() {
        if (config.auth().configParam().isEmpty()) {
            return AuthConfig.DISABLED;
        }
        String name = config.auth().configParam().get();
        String value = ProviderCall.run("ssm", "getParameter " + name,
                () -> ssm.get().getParameter(b -> b.name(name)).parameter().value());
        try {
            JsonNode j = mapper.readTree(value);
            return new AuthConfig(true, j.path("clientId").asText(), j.path("domain").asText(), j.path("region").asText());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
