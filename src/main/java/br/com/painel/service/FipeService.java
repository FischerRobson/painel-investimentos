package br.com.painel.service;

import br.com.painel.client.FipeClient;
import br.com.painel.dto.FipeMonth;
import br.com.painel.dto.FipePrice;
import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;

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

    private final FipeClient client;

    public FipeService(@RestClient FipeClient client) {
        this.client = client;
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

    @CacheResult(cacheName = "fipe-lists")
    public JsonNode brands(String type) {
        return client.brands(type);
    }

    @CacheResult(cacheName = "fipe-lists")
    public JsonNode models(String type, String brand) {
        return client.models(type, brand);
    }

    @CacheResult(cacheName = "fipe-lists")
    public JsonNode years(String type, String brand, String model) {
        return client.years(type, brand, model);
    }

    @CacheResult(cacheName = "fipe-refs")
    public JsonNode references() {
        return client.references();
    }

    @CacheResult(cacheName = "fipe-price")
    public FipePrice price(String type, String brand, String model, String year) {
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
