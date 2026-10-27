package br.com.painel.controller;

import br.com.painel.model.Backup;
import br.com.painel.service.CarteiraService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/backup")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class BackupController {

    private final CarteiraService service;

    public BackupController(CarteiraService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public Backup exportar() {
        return service.exportar();
    }

    @POST
    @Path("/import")
    @RunOnVirtualThread
    public void importar(@Valid @NotNull Backup backup) {
        service.importar(backup);
    }
}
