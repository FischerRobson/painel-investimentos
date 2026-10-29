package br.com.painel.client;

import br.com.painel.util.Http;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.rest.client.annotation.ClientHeaderParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

@RegisterRestClient(configKey = "brapi")
@ClientHeaderParam(name = "User-Agent", value = Http.USER_AGENT)
@Path("/api")
public interface BrapiClient {

    @GET
    @Path("/quote/{ticker}")
    Response quote(@PathParam("ticker") String ticker,
                   @QueryParam("range") String range,
                   @QueryParam("interval") String interval,
                   @QueryParam("modules") String modules,
                   @HeaderParam("Authorization") String authorization);

    /** Consumo do plano (não conta como consulta). */
    @GET
    @Path("/v2/user/usage")
    JsonNode usage(@HeaderParam("Authorization") String authorization);
}
