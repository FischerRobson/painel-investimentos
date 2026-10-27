package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.model.Carteira;
import br.com.painel.repository.DocumentStore.Condition;
import br.com.painel.service.CarteiraService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.Map;

@Path("/api/carteira")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class CarteiraController {

    private final CarteiraService service;

    public CarteiraController(CarteiraService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public Response get() {
        return service.carteira()
                .map(v -> Response.ok(v.value()).header("ETag", quote(v.etag())).build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).entity(new ErrorResponse("carteira ainda não criada")).build());
    }

    @PUT
    @RunOnVirtualThread
    public Response put(@Valid @NotNull Carteira carteira,
                        @HeaderParam("If-Match") String ifMatch,
                        @HeaderParam("If-None-Match") String ifNoneMatch) {
        Condition condition;
        if (ifMatch != null && !ifMatch.isBlank()) {
            condition = Condition.matches(ifMatch.replace("\"", "").strip());
        } else if (ifNoneMatch != null && ifNoneMatch.strip().equals("*")) {
            condition = Condition.absent();
        } else {
            return Response.status(428)
                    .entity(new ErrorResponse("envie If-Match com o ETag da última leitura (ou If-None-Match: * para criar)")).build();
        }
        String etag = service.salvar(carteira, condition);
        return Response.ok(Map.of("etag", etag)).header("ETag", quote(etag)).build();
    }

    private static String quote(String etag) {
        return "\"" + etag + "\"";
    }
}
