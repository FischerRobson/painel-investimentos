package br.com.painel.client;

import br.com.painel.util.Http;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import org.eclipse.microprofile.rest.client.annotation.ClientHeaderParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

@RegisterRestClient(configKey = "bcb")
@ClientHeaderParam(name = "User-Agent", value = Http.USER_AGENT)
@Path("/dados/serie")
public interface BcbClient {

    @GET
    @Path("/bcdata.sgs.{series}/dados")
    JsonNode series(@PathParam("series") int series,
                    @QueryParam("formato") String format,
                    @QueryParam("dataInicial") String startDate,
                    @QueryParam("dataFinal") String endDate);
}
