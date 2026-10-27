package br.com.painel.controller;

import br.com.painel.dto.AuthConfig;
import br.com.painel.service.AuthConfigService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/auth/config")
@Produces(MediaType.APPLICATION_JSON)
public class AuthController {

    private final AuthConfigService service;

    public AuthController(AuthConfigService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public AuthConfig config() {
        return service.get();
    }
}
