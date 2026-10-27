package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.service.FxService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

@Path("/api/fx")
@Produces(MediaType.APPLICATION_JSON)
public class FxController {

    private final FxService fx;

    public FxController(FxService fx) {
        this.fx = fx;
    }

    @GET
    @RunOnVirtualThread
    public Object fx(@QueryParam("days") @DefaultValue("30") String days,
                     @QueryParam("refresh") @DefaultValue("false") boolean refresh) {
        int d = days.matches("\\d{1,3}") && Integer.parseInt(days) >= 2 && Integer.parseInt(days) <= 360 ? Integer.parseInt(days) : 30;
        try {
            return fx.fx(d, refresh);
        } catch (RuntimeException e) {
            return new ErrorResponse("Câmbio indisponível agora: " + e.getMessage());
        }
    }
}
