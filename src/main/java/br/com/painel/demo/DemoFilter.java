package br.com.painel.demo;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.resteasy.reactive.server.ServerRequestFilter;

// Modo demonstração: com o header X-Painel-Demo: 1, toda chamada à API é respondida com dados fictícios,
// sem ler nem gravar os dados do usuário e sem consultar fontes externas. Roda antes do roteamento
// (preMatching), então nenhum controller é chamado. O login continua exigido.
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
        DemoDataService.Resposta r = demo.responder(ctx.getMethod(), path, ctx.getUriInfo().getQueryParameters());
        Response.ResponseBuilder b = Response.status(r.status());
        if (r.corpo() != null) {
            b.entity(r.corpo()).type(MediaType.APPLICATION_JSON_TYPE);
        }
        if (r.etag() != null) {
            b.header("ETag", "\"" + r.etag() + "\"");
        }
        return b.header("X-Painel-Demo", "1").build();
    }
}
