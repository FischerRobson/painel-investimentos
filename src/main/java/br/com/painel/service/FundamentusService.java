package br.com.painel.service;

import br.com.painel.cache.CacheService;
import br.com.painel.cache.Ttl;
import br.com.painel.client.FundamentusClient;
import br.com.painel.dto.Fundamentals;
import com.fasterxml.jackson.core.type.TypeReference;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static br.com.painel.util.Numbers.parseBr;

// O Fundamentus não tem API: lemos a tabela HTML. Se o site mudar o layout, é aqui que quebra.
@ApplicationScoped
public class FundamentusService {

    private static final TypeReference<Map<String, Fundamentals>> ALL = new TypeReference<>() {
    };

    private final FundamentusClient client;
    private final CacheService cache;

    public FundamentusService(@RestClient FundamentusClient client, CacheService cache) {
        this.client = client;
        this.cache = cache;
    }

    public Map<String, Fundamentals> all() {
        return cache.get("fundamentus", Ttl.of(Duration.ofHours(6)), ALL, false, this::fetchAll).value();
    }

    private Map<String, Fundamentals> fetchAll() {
        Map<String, Fundamentals> data = new HashMap<>();
        for (Map<String, String> r : table("resultado.php")) {
            data.put(r.get("Papel"), Fundamentals.acao(
                    parseBr(r.get("P/L")), parseBr(r.get("P/VP")), parseBr(r.get("Div.Yield")),
                    parseBr(r.get("ROE")), parseBr(r.get("ROIC")), parseBr(r.get("Mrg.Líq.")),
                    parseBr(r.get("EV/EBITDA")), parseBr(r.get("Dív.Líq/Patrim.")),
                    parseBr(r.get("Cresc.Rec.5a")), parseBr(r.get("Liq.2meses")), parseBr(r.get("Patrim.Líq"))));
        }
        for (Map<String, String> r : table("fii_resultado.php")) {
            data.put(r.get("Papel"), Fundamentals.fii(
                    r.get("Segmento"), parseBr(r.get("DividendYield")), parseBr(r.get("P/VP")),
                    parseBr(r.get("FFOYield")), parseBr(r.get("ValordeMercado")), parseBr(r.get("Liquidez")),
                    parseBr(r.get("Qtddeimóveis")), parseBr(r.get("CapRate")), parseBr(r.get("VacânciaMédia"))));
        }
        return data;
    }

    private List<Map<String, String>> table(String page) {
        Document doc = Jsoup.parse(new String(client.page(page), StandardCharsets.ISO_8859_1));
        Element table = doc.selectFirst("table#resultado");
        if (table == null) {
            table = doc.selectFirst("table");
        }
        if (table == null) {
            throw new IllegalStateException("Fundamentus: tabela não encontrada em " + page);
        }
        List<String> cols = table.select("thead th").stream().map(th -> key(th.text())).toList();
        List<Map<String, String>> rows = new ArrayList<>();
        for (Element tr : table.select("tbody tr")) {
            List<Element> cells = tr.select("td");
            if (cells.size() != cols.size()) {
                continue;
            }
            Map<String, String> row = new HashMap<>();
            for (int i = 0; i < cols.size(); i++) {
                row.put(cols.get(i), cells.get(i).text().strip());
            }
            rows.add(row);
        }
        return rows;
    }

    // "Mrg. Líq." → "Mrg.Líq." (o HTML varia espaços e &nbsp;)
    private static String key(String header) {
        return header.replaceAll("[\\s\\u00a0]+", "");
    }
}
