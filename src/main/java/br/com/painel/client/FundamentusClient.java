package br.com.painel.client;

import br.com.painel.util.Http;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import org.eclipse.microprofile.rest.client.annotation.ClientHeaderParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

@RegisterRestClient(configKey = "fundamentus")
@ClientHeaderParam(name = "User-Agent", value = Http.USER_AGENT)
public interface FundamentusClient {

    @GET
    @Path("/{page}")
    byte[] page(@PathParam("page") String page);
}
