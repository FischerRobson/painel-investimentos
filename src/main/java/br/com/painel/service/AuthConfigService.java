package br.com.painel.service;

import br.com.painel.config.PainelConfig;
import br.com.painel.dto.AuthConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import software.amazon.awssdk.services.ssm.SsmClient;

import java.io.IOException;
import java.io.UncheckedIOException;

// O client id do Cognito vem do SSM e não de variável de ambiente: o app client depende da URL da função,
// então passá-lo à função criaria um ciclo no CloudFormation. Lido na 1ª requisição (depois do restore do SnapStart).
@ApplicationScoped
public class AuthConfigService {

    private final PainelConfig config;
    private final Instance<SsmClient> ssm;
    private final ObjectMapper mapper;

    public AuthConfigService(PainelConfig config, Instance<SsmClient> ssm, ObjectMapper mapper) {
        this.config = config;
        this.ssm = ssm;
        this.mapper = mapper;
    }

    @CacheResult(cacheName = "auth-config")
    public AuthConfig get() {
        if (config.auth().configParam().isEmpty()) {
            return AuthConfig.DISABLED;
        }
        String value = ssm.get().getParameter(b -> b.name(config.auth().configParam().get())).parameter().value();
        try {
            JsonNode j = mapper.readTree(value);
            return new AuthConfig(true, j.path("clientId").asText(), j.path("domain").asText(), j.path("region").asText());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
