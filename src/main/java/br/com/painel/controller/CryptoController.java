package br.com.painel.controller;

import br.com.painel.dto.CryptoResponse;
import br.com.painel.service.CryptoService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Path("/api/crypto")
@Produces(MediaType.APPLICATION_JSON)
public class CryptoController {

    private final CryptoService crypto;

    public CryptoController(CryptoService crypto) {
        this.crypto = crypto;
    }

    @GET
    @RunOnVirtualThread
    public CryptoResponse prices(@QueryParam("coins") @DefaultValue("") String coins) {
        List<String> symbols = Arrays.stream(coins.split(","))
                .map(c -> c.strip().toUpperCase(Locale.ROOT)).filter(c -> !c.isEmpty()).toList();
        try {
            return new CryptoResponse(crypto.prices(symbols), crypto.available(), null);
        } catch (RuntimeException e) {
            return new CryptoResponse(Map.of(), crypto.available(), e.getMessage());
        }
    }
}
