package br.com.painel.service;

import br.com.painel.client.BcbClient;
import br.com.painel.dto.RatePoint;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.WebApplicationException;
import org.eclipse.microprofile.faulttolerance.Retry;
import org.eclipse.microprofile.rest.client.inject.RestClient;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@ApplicationScoped
public class BcbService {

    public static final int CDI = 12;
    public static final int IPCA = 433;

    private static final DateTimeFormatter BR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final BcbClient client;

    public BcbService(@RestClient BcbClient client) {
        this.client = client;
    }

    // A API do SGS aceita no máximo 10 anos por consulta
    public List<RatePoint> series(int serie, LocalDate start) {
        List<RatePoint> out = new ArrayList<>();
        LocalDate today = LocalDate.now();
        LocalDate from = start;
        while (!from.isAfter(today)) {
            LocalDate to = from.plusYears(9).isBefore(today) ? from.plusYears(9) : today;
            // chamada no próprio bean: o ArC intercepta (self-interception), então o @Retry vale
            out.addAll(window(serie, from, to));
            from = to.plusDays(1);
        }
        return out;
    }

    // A API do BCB oscila (502/timeout). 404 significa janela sem dados (ex.: IPCA do mês ainda não divulgado).
    @Retry(maxRetries = 2, delay = 1500, jitter = 0)
    public List<RatePoint> window(int serie, LocalDate from, LocalDate to) {
        JsonNode rows;
        try {
            rows = client.serie(serie, "json", from.format(BR), to.format(BR));
        } catch (WebApplicationException e) {
            if (e.getResponse() != null && e.getResponse().getStatus() == 404) {
                return List.of();
            }
            throw e;
        }
        List<RatePoint> out = new ArrayList<>();
        for (JsonNode row : rows) {
            String[] d = row.path("data").asText().split("/");
            out.add(new RatePoint(d[2] + "-" + d[1] + "-" + d[0], Double.parseDouble(row.path("valor").asText())));
        }
        return out;
    }
}
