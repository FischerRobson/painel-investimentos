package br.com.painel.service;

import br.com.painel.dto.CustosResponse;
import br.com.painel.dto.CustosResponse.Dia;
import br.com.painel.dto.CustosResponse.Mes;
import br.com.painel.dto.CustosResponse.Servico;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.costexplorer.CostExplorerClient;
import software.amazon.awssdk.services.costexplorer.model.DataUnavailableException;
import software.amazon.awssdk.services.costexplorer.model.DateInterval;
import software.amazon.awssdk.services.costexplorer.model.Granularity;
import software.amazon.awssdk.services.costexplorer.model.GroupDefinitionType;
import software.amazon.awssdk.services.costexplorer.model.Metric;
import software.amazon.awssdk.services.costexplorer.model.ResultByTime;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

// Custos da conta AWS pelo Cost Explorer. Cada chamada à API custa US$ 0,01: são 3 por atualização,
// guardadas em cache por 12 h. A conta tem só este app, então o total da conta é o custo dele.
@ApplicationScoped
public class CostService {

    private static final String METRICA = "UnblendedCost";
    private static final int MESES = 6;

    private volatile CostExplorerClient client;

    @CacheResult(cacheName = "custos")
    public CustosResponse custos() {
        LocalDate hoje = LocalDate.now();
        LocalDate amanha = hoje.plusDays(1);
        LocalDate inicioMes = hoje.withDayOfMonth(1);
        try {
            List<Mes> meses = client().getCostAndUsage(b -> b
                            .timePeriod(periodo(inicioMes.minusMonths(MESES - 1), amanha))
                            .granularity(Granularity.MONTHLY)
                            .metrics(METRICA)
                            .groupBy(g -> g.type(GroupDefinitionType.DIMENSION).key("SERVICE")))
                    .resultsByTime().stream().map(CostService::mes).toList();
            List<Dia> diario = client().getCostAndUsage(b -> b
                            .timePeriod(periodo(inicioMes, amanha))
                            .granularity(Granularity.DAILY)
                            .metrics(METRICA))
                    .resultsByTime().stream()
                    .map(r -> new Dia(r.timePeriod().start(), valor(r.total().get(METRICA).amount())))
                    .toList();
            return new CustosResponse(meses, diario, previsao(amanha, inicioMes.plusMonths(1)), System.currentTimeMillis(), null);
        } catch (DataUnavailableException e) {
            return new CustosResponse(List.of(), List.of(), null, System.currentTimeMillis(),
                    "A AWS ainda está processando os dados de custo da conta (leva até 24 h depois de ativar o Cost Explorer).");
        }
    }

    // Previsão do total do mês; a AWS não prevê com poucos dados ou no último dia do mês
    private Double previsao(LocalDate de, LocalDate ate) {
        if (!de.isBefore(ate)) {
            return null;
        }
        try {
            return valor(client().getCostForecast(b -> b
                    .timePeriod(periodo(de, ate))
                    .granularity(Granularity.MONTHLY)
                    .metric(Metric.UNBLENDED_COST)).total().amount());
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static Mes mes(ResultByTime r) {
        List<Servico> servicos = r.groups().stream()
                .map(g -> new Servico(g.keys().get(0), valor(g.metrics().get(METRICA).amount())))
                .filter(s -> s.valor() > 0)
                .sorted(Comparator.comparingDouble(Servico::valor).reversed())
                .toList();
        return new Mes(r.timePeriod().start().substring(0, 7), servicos.stream().mapToDouble(Servico::valor).sum(), servicos);
    }

    private static DateInterval periodo(LocalDate inicio, LocalDate fim) {
        return DateInterval.builder().start(inicio.toString()).end(fim.toString()).build();
    }

    private static double valor(String amount) {
        return amount == null ? 0 : Double.parseDouble(amount);
    }

    private CostExplorerClient client() {
        if (client == null) {
            synchronized (this) {
                if (client == null) {
                    // o Cost Explorer só existe em us-east-1
                    client = CostExplorerClient.builder().region(Region.US_EAST_1)
                            .httpClientBuilder(UrlConnectionHttpClient.builder()).build();
                }
            }
        }
        return client;
    }
}
