package br.com.painel.service;

import br.com.painel.config.AppConfig;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.ApplicationScoped;

// On Lambda, the Cognito token subject (each user has their own folder); locally, without login, the configured owner.
@ApplicationScoped
public class CurrentUser {

    private final SecurityIdentity identity;
    private final AppConfig config;

    public CurrentUser(SecurityIdentity identity, AppConfig config) {
        this.identity = identity;
        this.config = config;
    }

    public String id() {
        return identity.isAnonymous() ? config.storage().owner() : identity.getPrincipal().getName();
    }
}
