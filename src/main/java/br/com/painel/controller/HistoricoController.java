package br.com.painel.controller;

import br.com.painel.model.Snapshot;
import br.com.painel.service.CarteiraService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.Map;

@Path("/api/historico")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class HistoricoController {

    private final CarteiraService service;

    public HistoricoController(CarteiraService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public Map<String, Snapshot> get() {
        return service.historico();
    }

    @PUT
    @Path("/{data}")
    @RunOnVirtualThread
    public void put(@PathParam("data") @Pattern(regexp = "\\d{4}-\\d{2}-\\d{2}") String data, @Valid @NotNull Snapshot snapshot) {
        service.registrarSnapshot(data, snapshot);
    }
}
