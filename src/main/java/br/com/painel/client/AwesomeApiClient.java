package br.com.painel.client;

import br.com.painel.util.Http;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;
import org.eclipse.microprofile.rest.client.annotation.ClientHeaderParam;

@RegisterRestClient(configKey = "awesomeapi")
@ClientHeaderParam(name = "User-Agent", value = Http.USER_AGENT)
@Path("/json")
public interface AwesomeApiClient {

    @GET
    @Path("/last/{pairs}")
    JsonNode last(@PathParam("pairs") String pairs);

    @GET
    @Path("/daily/{pair}/{days}")
    JsonNode daily(@PathParam("pair") String pair, @PathParam("days") int days);
}
