package br.com.painel.client;

import br.com.painel.util.Http;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import org.eclipse.microprofile.rest.client.annotation.ClientHeaderParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

@RegisterRestClient(configKey = "coingecko")
@ClientHeaderParam(name = "User-Agent", value = Http.USER_AGENT)
@Path("/api/v3/simple")
public interface CoinGeckoClient {

    @GET
    @Path("/price")
    JsonNode price(@QueryParam("ids") String ids,
                   @QueryParam("vs_currencies") String vsCurrencies,
                   @QueryParam("include_24hr_change") boolean include24hChange);
}
