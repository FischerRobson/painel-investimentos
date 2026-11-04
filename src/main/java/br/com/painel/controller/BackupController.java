package br.com.painel.controller;

import br.com.painel.model.Backup;
import br.com.painel.service.WalletService;
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

    private final WalletService service;

    public BackupController(WalletService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public Backup exportBackup() {
        return service.exportBackup();
    }

    @POST
    @Path("/import")
    @RunOnVirtualThread
    public void importBackup(@Valid @NotNull Backup backup) {
        service.importBackup(backup);
    }
}
