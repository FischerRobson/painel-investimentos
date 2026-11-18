package br.com.painel.service;

import br.com.painel.client.FocusClient;
import br.com.painel.dto.FocusPoint;
import br.com.painel.dto.RatePoint;
import br.com.painel.dto.TermometroResponse;
import br.com.painel.util.ProviderCall;
import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@ApplicationScoped
public class TermometroService {

    static final int ANOS_HISTORICO = 10;

    private final BcbService bcb;
    private final FocusClient focus;

    public TermometroService(BcbService bcb, @RestClient FocusClient focus) {
        this.bcb = bcb;
        this.focus = focus;
    }

    // Séries do BCB falham tudo junto (o próprio BcbService tem retry); o Focus é separado e, se cair, a página mostra só o realizado.
    @CacheResult(cacheName = "termometro")
    public TermometroResponse dados() {
        LocalDate inicio = LocalDate.now().minusYears(ANOS_HISTORICO);
        List<RatePoint> ipca = bcb.series(BcbService.IPCA, inicio);
        List<RatePoint> cdi = bcb.series(BcbService.CDI, inicio);
        List<RatePoint> selic = bcb.series(BcbService.SELIC_META, inicio);
        String data = null, erro = null;
        List<FocusPoint> expectativas = null;
        try {
            List<FocusPoint> out = new ArrayList<>();
            data = focusDoMes(out);
            expectativas = out;
        } catch (RuntimeException e) {
            erro = "Não consegui as expectativas do Boletim Focus agora.";
        }
        return new TermometroResponse(ipca, cdi, selic, data, expectativas, erro);
    }

    // Só a última edição do Focus, para IPCA e Selic, nos dois anos seguintes ao ano corrente.
    String focusDoMes(List<FocusPoint> out) {
        LocalDate corte = LocalDate.now().minusDays(60);
        JsonNode rows = ProviderCall.run("bcb-focus", "anuais IPCA/Selic desde " + corte,
                () -> focus.anuais(url("(Indicador eq 'IPCA' or Indicador eq 'Selic') and Data ge '" + corte + "'"), url("Data desc"), 300, "json"));
        return escolherUltimaEdicao(rows, LocalDate.now().getYear(), out);
    }

    private static String url(String odata) {
        return odata.replace(" ", "%20");
    }

    // Função pura (testável): mantém a edição mais recente e os anos corrente e seguintes.
    static String escolherUltimaEdicao(JsonNode rows, int anoAtual, List<FocusPoint> out) {
        String ultima = null;
        for (JsonNode r : rows.path("value")) {
            String d = r.path("Data").asText(null);
            if (d != null && (ultima == null || d.compareTo(ultima) > 0)) ultima = d;
        }
        if (ultima == null) return null;
        for (JsonNode r : rows.path("value")) {
            if (!ultima.equals(r.path("Data").asText(null))) continue;
            // baseCalculo 0 = todos os participantes (o padrão do boletim); 1 = só quem atualizou nos últimos 30 dias
            if (r.path("baseCalculo").asInt(0) != 0) continue;
            int ano;
            try {
                ano = Integer.parseInt(r.path("DataReferencia").asText());
            } catch (NumberFormatException e) {
                continue;
            }
            if (ano < anoAtual || ano > anoAtual + 2) continue;
            out.add(new FocusPoint(r.path("Indicador").asText(), String.valueOf(ano),
                    numero(r, "Mediana"), numero(r, "Minimo"), numero(r, "Maximo")));
        }
        out.sort(Comparator.comparing(FocusPoint::indicador).thenComparing(FocusPoint::ano));
        return ultima;
    }

    private static Double numero(JsonNode r, String campo) {
        JsonNode n = r.path(campo);
        return n.isNumber() ? n.asDouble() : null;
    }
}
