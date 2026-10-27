package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.service.RatesService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

@Path("/api/rates")
@Produces(MediaType.APPLICATION_JSON)
public class RatesController {

    private final RatesService rates;

    public RatesController(RatesService rates) {
        this.rates = rates;
    }

    @GET
    @RunOnVirtualThread
    public Object rates(@QueryParam("from") @DefaultValue("") String from) {
        LocalDate start;
        try {
            start = LocalDate.parse(from);
        } catch (DateTimeParseException e) {
            return new ErrorResponse("data inválida");
        }
        try {
            return rates.rates(start);
        } catch (RuntimeException e) {
            return new ErrorResponse("Banco Central indisponível: " + e.getMessage());
        }
    }
}
