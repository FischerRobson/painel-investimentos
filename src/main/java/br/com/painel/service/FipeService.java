package br.com.painel.service;

import br.com.painel.cache.CacheService;
import br.com.painel.cache.Ttl;
import br.com.painel.client.FipeClient;
import br.com.painel.dto.FipeMonth;
import br.com.painel.dto.FipePrice;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import static br.com.painel.util.Numbers.parseBr;

@ApplicationScoped
public class FipeService {

    public static final Set<String> TYPES = Set.of("cars", "motorcycles", "trucks");
    private static final Pattern ID = Pattern.compile("[\\w-]{1,20}");
    // o plano grátis libera o mês atual e os 2 anteriores
    private static final int PREVIOUS_MONTHS = 3;

    private static final TypeReference<JsonNode> JSON = new TypeReference<>() {
    };
    private static final TypeReference<FipePrice> PRICE = new TypeReference<>() {
    };
    private static final Ttl LISTAS = Ttl.of(Duration.ofDays(7));
    // a tabela FIPE muda uma vez por mês
    private static final Ttl DIARIO = Ttl.of(Duration.ofDays(1));

    private final FipeClient client;
    private final CacheService cache;

    public FipeService(@RestClient FipeClient client, CacheService cache) {
        this.client = client;
        this.cache = cache;
    }

    public Object query(String kind, String type, String brand, String model, String year) {
        if (!TYPES.contains(type) || invalid(brand) || invalid(model) || invalid(year)) {
            throw new IllegalArgumentException("parâmetros inválidos");
        }
        return switch (kind) {
            case "brands" -> brands(type);
            case "models" -> models(type, brand);
            case "years" -> years(type, brand, model);
            case "price" -> price(type, brand, model, year);
            default -> throw new IllegalArgumentException("rota inválida");
        };
    }

    public JsonNode brands(String type) {
        return cache.get("fipe:brands:" + type, LISTAS, JSON, false, () -> client.brands(type)).value();
    }

    public JsonNode models(String type, String brand) {
        return cache.get("fipe:models:" + type + ":" + brand, LISTAS, JSON, false, () -> client.models(type, brand)).value();
    }

    public JsonNode years(String type, String brand, String model) {
        return cache.get("fipe:years:" + type + ":" + brand + ":" + model, LISTAS, JSON, false,
                () -> client.years(type, brand, model)).value();
    }

    public JsonNode references() {
        return cache.get("fipe:refs", DIARIO, JSON, false, client::references).value();
    }

    public FipePrice price(String type, String brand, String model, String year) {
        return cache.get("fipe:price:" + String.join(":", type, brand, model, year), DIARIO, PRICE, false,
                () -> fetchPrice(type, brand, model, year)).value();
    }

    private FipePrice fetchPrice(String type, String brand, String model, String year) {
        JsonNode cur = client.price(type, brand, model, year, null);
        if (!cur.has("price")) {
            throw new IllegalStateException(cur.path("error").asText("veículo não encontrado"));
        }
        List<FipeMonth> history = new ArrayList<>();
        JsonNode refs = references();
        for (int i = 1; i <= PREVIOUS_MONTHS && i < refs.size(); i++) {
            try {
                JsonNode old = client.price(type, brand, model, year, refs.get(i).path("code").asInt());
                if (old.has("price")) {
                    history.add(new FipeMonth(old.path("referenceMonth").asText(), money(old.path("price").asText())));
                }
            } catch (RuntimeException e) {
                // meses mais antigos são só para assinantes
                break;
            }
        }
        Collections.reverse(history);
        history.add(new FipeMonth(cur.path("referenceMonth").asText(), money(cur.path("price").asText())));
        return new FipePrice(cur.path("brand").asText(), cur.path("model").asText(), cur.path("modelYear").asInt(),
                cur.path("fuel").asText(), cur.path("codeFipe").asText(), cur.path("referenceMonth").asText(),
                money(cur.path("price").asText()), history);
    }

    private static boolean invalid(String id) {
        return id != null && !id.isEmpty() && !ID.matcher(id).matches();
    }

    private static Double money(String v) {
        return parseBr(v.replace("R$", ""));
    }
}
