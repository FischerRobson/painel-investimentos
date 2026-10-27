package br.com.painel.client;

import br.com.painel.util.Http;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import org.eclipse.microprofile.rest.client.annotation.ClientHeaderParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

@RegisterRestClient(configKey = "yahoo")
@ClientHeaderParam(name = "User-Agent", value = Http.USER_AGENT)
@Path("/v8/finance/chart")
public interface YahooClient {

    @GET
    @Path("/{symbol}")
    JsonNode chart(@PathParam("symbol") String symbol,
                   @QueryParam("range") String range,
                   @QueryParam("interval") String interval,
                   @QueryParam("events") String events);
}
