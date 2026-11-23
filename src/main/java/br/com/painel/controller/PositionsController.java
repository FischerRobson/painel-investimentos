package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.service.WalletService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;

// Positions saved by the daily snapshot (one file per B3 trading day)
@Path("/api/positions")
@Produces(MediaType.APPLICATION_JSON)
public class PositionsController {

    private final WalletService service;

    public PositionsController(WalletService service) {
        this.service = service;
    }

    // Days with saved positions, oldest first ("AAAA-MM-DD")
    @GET
    @RunOnVirtualThread
    public List<String> dates() {
        return service.positionDates();
    }

    @GET
    @Path("/{date}")
    @RunOnVirtualThread
    public Response day(@PathParam("date") String date) {
        LocalDate day;
        try {
            day = LocalDate.parse(date);
        } catch (DateTimeParseException e) {
            return Response.status(Response.Status.BAD_REQUEST).entity(new ErrorResponse("data inválida")).build();
        }
        return service.positions(day)
                .map(p -> Response.ok(p).build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).entity(new ErrorResponse("sem posições salvas neste dia")).build());
    }
}
