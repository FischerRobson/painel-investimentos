package br.com.painel.client;

import br.com.painel.util.Http;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import org.eclipse.microprofile.rest.client.annotation.ClientHeaderParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

@RegisterRestClient(configKey = "fipe")
@ClientHeaderParam(name = "User-Agent", value = Http.USER_AGENT)
@Path("/api/v2")
public interface FipeClient {

    @GET
    @Path("/references")
    JsonNode references();

    @GET
    @Path("/{type}/brands")
    JsonNode brands(@PathParam("type") String type);

    @GET
    @Path("/{type}/brands/{brand}/models")
    JsonNode models(@PathParam("type") String type, @PathParam("brand") String brand);

    @GET
    @Path("/{type}/brands/{brand}/models/{model}/years")
    JsonNode years(@PathParam("type") String type, @PathParam("brand") String brand, @PathParam("model") String model);

    @GET
    @Path("/{type}/brands/{brand}/models/{model}/years/{year}")
    JsonNode price(@PathParam("type") String type, @PathParam("brand") String brand,
                   @PathParam("model") String model, @PathParam("year") String year,
                   @QueryParam("reference") Integer reference);
}
