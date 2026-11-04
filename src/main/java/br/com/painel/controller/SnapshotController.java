package br.com.painel.controller;

import br.com.painel.config.AppConfig;
import br.com.painel.snapshot.SnapshotService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;

// Called by EventBridge Scheduler (direct Lambda invoke) every day at 18:00 Brasília time. Outside /api, so no Cognito
// token is required; the shared token from the template protects it instead.
@Path("/internal/snapshots")
public class SnapshotController {

    public static final String TOKEN_HEADER = "X-Snapshot-Token";

    private final SnapshotService service;
    private final AppConfig config;

    public SnapshotController(SnapshotService service, AppConfig config) {
        this.service = service;
        this.config = config;
    }

    @POST
    @Produces(MediaType.APPLICATION_JSON)
    @RunOnVirtualThread
    public Response run(@HeaderParam(TOKEN_HEADER) String token) {
        if (!authorized(token)) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        return Response.ok(service.takeAll()).build();
    }

    private boolean authorized(String token) {
        Optional<String> expected = config.snapshot().token().filter(t -> !t.isBlank());
        if (expected.isEmpty()) {
            return !config.snapshot().requireToken();
        }
        return token != null && MessageDigest.isEqual(expected.get().getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8));
    }
}
