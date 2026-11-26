package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.service.TesouroService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/tesouro")
@Produces(MediaType.APPLICATION_JSON)
public class TesouroController {

    private final TesouroService tesouro;

    public TesouroController(TesouroService tesouro) {
        this.tesouro = tesouro;
    }

    @GET
    @RunOnVirtualThread
    public Object titulos() {
        try {
            return tesouro.titulos();
        } catch (RuntimeException e) {
            return new ErrorResponse("Tesouro Direto indisponível: " + e.getMessage());
        }
    }
}
