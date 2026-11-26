package br.com.painel.client;

import br.com.painel.util.Http;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import org.eclipse.microprofile.rest.client.annotation.ClientHeaderParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

// Frankfurter: reference rates of the European Central Bank (one per business day, no key). Fallback for the AwesomeAPI.
@RegisterRestClient(configKey = "frankfurter")
@ClientHeaderParam(name = "User-Agent", value = Http.USER_AGENT)
@Path("/v1")
public interface FrankfurterClient {

    // {"base":"BRL","rates":{"2026-11-24":{"USD":0.17,...},...}}; "start.." means "from start to today"
    @GET
    @Path("/{range}")
    JsonNode series(@PathParam("range") String range, @QueryParam("base") String base, @QueryParam("symbols") String symbols);
}
