package br.com.painel.controller;

import br.com.painel.dto.VersionInfo;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.config.inject.ConfigProperty;

// Versão da API, a mesma do pom.xml. Pública (sem token): a página mostra antes do login
// e o deploy confere se a versão no ar é a que acabou de ser publicada.
@Path("/api/version")
@Produces(MediaType.APPLICATION_JSON)
public class VersionController {

    private final VersionInfo info;

    public VersionController(@ConfigProperty(name = "quarkus.application.version") String version) {
        this.info = new VersionInfo(version);
    }

    @GET
    public VersionInfo version() {
        return info;
    }
}
