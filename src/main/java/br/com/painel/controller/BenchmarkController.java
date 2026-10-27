package br.com.painel.controller;

import br.com.painel.dto.BenchmarkResponse;
import br.com.painel.service.BenchmarkService;
import br.com.painel.service.CryptoService;
import br.com.painel.service.FxService;
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
import java.util.function.Predicate;

@Path("/api/benchmarks")
@Produces(MediaType.APPLICATION_JSON)
public class BenchmarkController {

    private final BenchmarkService service;

    public BenchmarkController(BenchmarkService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public BenchmarkResponse get(@QueryParam("range") @DefaultValue("1y") String range,
                                 @QueryParam("fx") @DefaultValue("") String fx,
                                 @QueryParam("crypto") @DefaultValue("") String crypto) {
        return service.get(BenchmarkService.RANGES.contains(range) ? range : "1y",
                lista(fx, FxService.CODES::contains), lista(crypto, CryptoService.COINS::containsKey));
    }

    private static List<String> lista(String raw, Predicate<String> valido) {
        return Arrays.stream(raw.split(",")).map(s -> s.strip().toUpperCase(Locale.ROOT))
                .filter(valido).distinct().toList();
    }
}
