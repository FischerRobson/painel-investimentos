package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuthConfig(boolean enabled, String clientId, String domain, String region) {

    public static final AuthConfig DISABLED = new AuthConfig(false, null, null, null);
}
