package br.com.painel.controller;

import br.com.painel.dto.ErrorResponse;
import br.com.painel.repository.PreconditionFailedException;
import br.com.painel.service.InvalidDataException;
import jakarta.ws.rs.core.Response;
import org.jboss.resteasy.reactive.server.ServerExceptionMapper;

public class ErrorMappers {

    @ServerExceptionMapper
    public Response precondition(PreconditionFailedException e) {
        return Response.status(Response.Status.PRECONDITION_FAILED)
                .entity(new ErrorResponse("Seus dados foram alterados em outro dispositivo. Recarregue a página.")).build();
    }

    @ServerExceptionMapper
    public Response invalid(InvalidDataException e) {
        return Response.status(Response.Status.BAD_REQUEST).entity(new ErrorResponse(e.getMessage())).build();
    }
}
