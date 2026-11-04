package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.service.CostService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/custos")
@Produces(MediaType.APPLICATION_JSON)
public class CostController {

    private final CostService service;

    public CostController(CostService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public Object costs() {
        try {
            return service.costs();
        } catch (RuntimeException e) {
            return new ErrorResponse("Não consegui consultar os custos na AWS: " + e.getMessage());
        }
    }
}
