package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.model.Wallet;
import br.com.painel.service.WalletService;
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
public class WalletController {

    private final WalletService service;

    public WalletController(WalletService service) {
        this.service = service;
    }

    @GET
    @RunOnVirtualThread
    public Response get() {
        return service.wallet()
                .map(v -> Response.ok(v.value()).header("ETag", Preconditions.quote(v.etag())).build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).entity(new ErrorResponse("carteira ainda não criada")).build());
    }

    @PUT
    @RunOnVirtualThread
    public Response put(@Valid @NotNull Wallet wallet,
                        @HeaderParam("If-Match") String ifMatch,
                        @HeaderParam("If-None-Match") String ifNoneMatch) {
        String etag = service.save(wallet, Preconditions.from(ifMatch, ifNoneMatch));
        return Response.ok(Map.of("etag", etag)).header("ETag", Preconditions.quote(etag)).build();
    }
}
