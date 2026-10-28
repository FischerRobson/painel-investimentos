package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.service.BrapiService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/brapi/uso")
@Produces(MediaType.APPLICATION_JSON)
public class BrapiController {

    private final BrapiService service;

    public BrapiController(BrapiService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public Object uso() {
        try {
            return service.uso();
        } catch (RuntimeException e) {
            return new ErrorResponse("Não consegui consultar o consumo da brapi: " + e.getMessage());
        }
    }
}
