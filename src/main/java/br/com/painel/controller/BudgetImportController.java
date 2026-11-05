package br.com.painel.controller;

import br.com.painel.dto.ImportPreview;
import br.com.painel.dto.ImportRequest;
import br.com.painel.dto.ImportResult;
import br.com.painel.service.StatementImportService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

@Path("/api/budget/import")
@Produces(MediaType.APPLICATION_JSON)
public class BudgetImportController {

    private final StatementImportService service;

    public BudgetImportController(StatementImportService service) {
        this.service = service;
    }

    @POST
    @Path("/preview")
    @Consumes(MediaType.WILDCARD)
    @RunOnVirtualThread
    public ImportPreview preview(@QueryParam("name") String name, byte[] content) {
        return service.preview(name, content);
    }

    @POST
    @Path("/commit")
    @Consumes(MediaType.APPLICATION_JSON)
    @RunOnVirtualThread
    public ImportResult commit(@Valid @NotNull ImportRequest request) {
        return service.commit(request);
    }
}
