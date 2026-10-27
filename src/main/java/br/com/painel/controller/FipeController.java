package br.com.painel.controller;

import br.com.painel.dto.DataEnvelope;
import br.com.painel.dto.ErrorResponse;
import br.com.painel.service.FipeService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;

@Path("/api/fipe/{kind}")
@Produces(MediaType.APPLICATION_JSON)
public class FipeController {

    private final FipeService fipe;

    public FipeController(FipeService fipe) {
        this.fipe = fipe;
    }

    @GET
    @RunOnVirtualThread
    public Object query(@PathParam("kind") String kind,
                        @QueryParam("type") @DefaultValue("") String type,
                        @QueryParam("brand") @DefaultValue("") String brand,
                        @QueryParam("model") @DefaultValue("") String model,
                        @QueryParam("year") @DefaultValue("") String year) {
        try {
            return new DataEnvelope(fipe.query(kind, type, brand, model, year));
        } catch (WebApplicationException e) {
            int status = e.getResponse() != null ? e.getResponse().getStatus() : 0;
            return new ErrorResponse(status == 429 ? "limite diário da FIPE atingido, tente amanhã" : "FIPE indisponível (" + status + ")");
        } catch (RuntimeException e) {
            return new ErrorResponse(e.getMessage());
        }
    }
}
