package br.com.painel.demo;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.resteasy.reactive.server.ServerRequestFilter;

// Demo mode: with the X-Painel-Demo: 1 header, every API call is answered with fake data, without reading or
// writing user data and without calling external sources. Runs before routing (preMatching), so no controller
// is called. Login is still required.
public class DemoFilter {

    public static final String HEADER = "X-Painel-Demo";

    private final DemoDataService demo;

    public DemoFilter(DemoDataService demo) {
        this.demo = demo;
    }

    @ServerRequestFilter(preMatching = true)
    public Response filter(ContainerRequestContext ctx) {
        String path = ctx.getUriInfo().getPath();
        if (!"1".equals(ctx.getHeaderString(HEADER)) || !path.startsWith("/api/") || path.startsWith("/api/auth/")
                || path.equals("/api/version")) {
            return null;
        }
        DemoDataService.Reply r = demo.reply(ctx.getMethod(), path, ctx.getUriInfo().getQueryParameters());
        Response.ResponseBuilder b = Response.status(r.status());
        if (r.body() != null) {
            b.entity(r.body()).type(MediaType.APPLICATION_JSON_TYPE);
        }
        if (r.etag() != null) {
            b.header("ETag", "\"" + r.etag() + "\"");
        }
        return b.header("X-Painel-Demo", "1").build();
    }
}
