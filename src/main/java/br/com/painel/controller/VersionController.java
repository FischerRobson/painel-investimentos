package br.com.painel.controller;

import br.com.painel.dto.VersionInfo;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.config.inject.ConfigProperty;

// API version, the same as pom.xml. Public (no token): the page shows it before login
// and the deploy checks that the live version is the one just published.
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
