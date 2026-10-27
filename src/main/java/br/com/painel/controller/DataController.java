package br.com.painel.controller;

import br.com.painel.dto.DataResponse;
import br.com.painel.service.StockService;
import br.com.painel.util.Tickers;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

@Path("/api/data")
@Produces(MediaType.APPLICATION_JSON)
public class DataController {

    private final StockService stocks;

    public DataController(StockService stocks) {
        this.stocks = stocks;
    }

    @GET
    @RunOnVirtualThread
    public DataResponse data(@QueryParam("symbols") @DefaultValue("") String symbols,
                             @QueryParam("range") @DefaultValue("1y") String range,
                             @QueryParam("refresh") @DefaultValue("false") boolean refresh) {
        return stocks.data(Tickers.parse(symbols), StockService.validRange(range) ? range : "1y", refresh);
    }
}
