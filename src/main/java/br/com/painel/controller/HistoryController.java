package br.com.painel.controller;

import br.com.painel.model.Snapshot;
import br.com.painel.service.WalletService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.Map;

@Path("/api/historico")
@Produces(MediaType.APPLICATION_JSON)
public class HistoryController {

    private final WalletService service;

    public HistoryController(WalletService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public Map<String, Snapshot> get() {
        return service.history();
    }
}
