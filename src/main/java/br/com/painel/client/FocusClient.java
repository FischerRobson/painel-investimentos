package br.com.painel.client;

import br.com.painel.util.Http;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.Encoded;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import org.eclipse.microprofile.rest.client.annotation.ClientHeaderParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

// Boletim Focus (expectativas de mercado do Banco Central), API OData do Olinda
@RegisterRestClient(configKey = "bcb-focus")
@ClientHeaderParam(name = "User-Agent", value = Http.USER_AGENT)
@Path("/olinda/servico/Expectativas/versao/v1/odata")
public interface FocusClient {

    // @Encoded: o cliente codificaria o espaço como '+', que o Olinda recusa (400); os valores já vêm com %20
    @GET
    @Encoded
    @Path("/ExpectativasMercadoAnuais")
    JsonNode anuais(@QueryParam("$filter") String filter,
                    @QueryParam("$orderby") String orderBy,
                    @QueryParam("$top") int top,
                    @QueryParam("$format") String format);
}
