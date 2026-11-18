package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.service.TermometroService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/termometro")
@Produces(MediaType.APPLICATION_JSON)
public class TermometroController {

    private final TermometroService termometro;

    public TermometroController(TermometroService termometro) {
        this.termometro = termometro;
    }

    @GET
    @RunOnVirtualThread
    public Object dados() {
        try {
            return termometro.dados();
        } catch (RuntimeException e) {
            return new ErrorResponse("Banco Central indisponível: " + e.getMessage());
        }
    }
}
