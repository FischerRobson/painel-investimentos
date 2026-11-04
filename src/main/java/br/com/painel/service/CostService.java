package br.com.painel.service;

import br.com.painel.dto.CostResponse;
import br.com.painel.dto.CostResponse.Day;
import br.com.painel.dto.CostResponse.Month;
import br.com.painel.dto.CostResponse.Service;
import br.com.painel.util.ProviderCall;
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

// AWS account costs from Cost Explorer. Each API call costs US$ 0.01: three per refresh, cached for 12 h.
// The account only runs this app, so the account total is the app cost.
@ApplicationScoped
public class CostService {

    private static final String PROVIDER = "cost-explorer";
    private static final String METRIC = "UnblendedCost";
    private static final int MONTHS = 6;

    private volatile CostExplorerClient client;

    @CacheResult(cacheName = "custos")
    public CostResponse costs() {
        LocalDate today = LocalDate.now();
        LocalDate tomorrow = today.plusDays(1);
        LocalDate monthStart = today.withDayOfMonth(1);
        try {
            List<Month> months = ProviderCall.run(PROVIDER, "getCostAndUsage monthly", () -> client().getCostAndUsage(b -> b
                            .timePeriod(period(monthStart.minusMonths(MONTHS - 1), tomorrow))
                            .granularity(Granularity.MONTHLY)
                            .metrics(METRIC)
                            .groupBy(g -> g.type(GroupDefinitionType.DIMENSION).key("SERVICE"))))
                    .resultsByTime().stream().map(CostService::month).toList();
            List<Day> daily = ProviderCall.run(PROVIDER, "getCostAndUsage daily", () -> client().getCostAndUsage(b -> b
                            .timePeriod(period(monthStart, tomorrow))
                            .granularity(Granularity.DAILY)
                            .metrics(METRIC)))
                    .resultsByTime().stream()
                    .map(r -> new Day(r.timePeriod().start(), amount(r.total().get(METRIC).amount())))
                    .toList();
            return new CostResponse(months, daily, forecast(tomorrow, monthStart.plusMonths(1)), System.currentTimeMillis(), null);
        } catch (DataUnavailableException e) {
            return new CostResponse(List.of(), List.of(), null, System.currentTimeMillis(),
                    "A AWS ainda está processando os dados de custo da conta (leva até 24 h depois de ativar o Cost Explorer).");
        }
    }

    // Month total forecast; AWS does not forecast with little data or on the last day of the month
    private Double forecast(LocalDate from, LocalDate to) {
        if (!from.isBefore(to)) {
            return null;
        }
        try {
            return amount(ProviderCall.run(PROVIDER, "getCostForecast", () -> client().getCostForecast(b -> b
                    .timePeriod(period(from, to))
                    .granularity(Granularity.MONTHLY)
                    .metric(Metric.UNBLENDED_COST))).total().amount());
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static Month month(ResultByTime r) {
        List<Service> services = r.groups().stream()
                .map(g -> new Service(g.keys().get(0), amount(g.metrics().get(METRIC).amount())))
                .filter(s -> s.value() > 0)
                .sorted(Comparator.comparingDouble(Service::value).reversed())
                .toList();
        return new Month(r.timePeriod().start().substring(0, 7), services.stream().mapToDouble(Service::value).sum(), services);
    }

    private static DateInterval period(LocalDate start, LocalDate end) {
        return DateInterval.builder().start(start.toString()).end(end.toString()).build();
    }

    private static double amount(String amount) {
        return amount == null ? 0 : Double.parseDouble(amount);
    }

    private CostExplorerClient client() {
        if (client == null) {
            synchronized (this) {
                if (client == null) {
                    // Cost Explorer only exists in us-east-1
                    client = CostExplorerClient.builder().region(Region.US_EAST_1)
                            .httpClientBuilder(UrlConnectionHttpClient.builder()).build();
                }
            }
        }
        return client;
    }
}
