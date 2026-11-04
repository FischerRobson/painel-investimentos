package br.com.painel.service;

import br.com.painel.client.FundamentusClient;
import br.com.painel.dto.Fundamentals;
import br.com.painel.util.ProviderCall;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.rest.client.inject.RestClient;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static br.com.painel.util.Numbers.parseBr;

// Fundamentus has no API: we scrape the HTML table. If the site layout changes, this is where it breaks.
@ApplicationScoped
public class FundamentusService {

    private final FundamentusClient client;

    public FundamentusService(@RestClient FundamentusClient client) {
        this.client = client;
    }

    @CacheResult(cacheName = "fundamentus")
    public Map<String, Fundamentals> all() {
        Map<String, Fundamentals> data = new HashMap<>();
        for (Map<String, String> r : table("resultado.php")) {
            data.put(r.get("Papel"), Fundamentals.stock(
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
        byte[] html = ProviderCall.run("fundamentus", "page " + page, () -> client.page(page));
        Document doc = Jsoup.parse(new String(html, StandardCharsets.ISO_8859_1));
        Element table = doc.selectFirst("table#resultado");
        if (table == null) {
            table = doc.selectFirst("table");
        }
        if (table == null) {
            throw new IllegalStateException("Fundamentus: table not found in " + page);
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

    // "Mrg. Líq." -> "Mrg.Líq." (the HTML mixes spaces and &nbsp;)
    private static String key(String header) {
        return header.replaceAll("[\\s\\u00a0]+", "");
    }
}
