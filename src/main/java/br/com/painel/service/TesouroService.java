package br.com.painel.service;

import br.com.painel.config.AppConfig;
import br.com.painel.dto.TesouroResponse;
import br.com.painel.dto.TesouroTitulo;
import br.com.painel.util.Http;
import br.com.painel.util.ProviderCall;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Preços e taxas do Tesouro Direto pelo CSV público do Tesouro Transparente ("Preço e Taxa do Tesouro Direto").
// O arquivo tem todo o histórico desde 2002 (~15 MB), mas vem com a data mais recente no topo: lemos só o primeiro
// bloco de datas e fechamos a conexão assim que aparece uma data mais antiga. Se um dia a ordem mudar para a mais
// antiga primeiro, a mesma regra lê o arquivo inteiro e continua certa (só fica mais lenta).
@ApplicationScoped
public class TesouroService {

    static final String URL = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3"
            + "/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv";

    private static final Logger LOG = LoggerFactory.getLogger(TesouroService.class);
    private static final DateTimeFormatter BR = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter STALE_FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");
    private static final List<String> COLUNAS = List.of("Tipo Titulo", "Data Vencimento", "Data Base",
            "Taxa Compra Manha", "Taxa Venda Manha", "PU Compra Manha", "PU Venda Manha", "PU Base Manha");

    private final ObjectMapper mapper;
    private final Path diskFile;

    public TesouroService(ObjectMapper mapper, AppConfig config) {
        this.mapper = mapper;
        this.diskFile = Path.of(config.tesouroCacheFile());
    }

    public TesouroResponse titulos() {
        try {
            return fresh();
        } catch (RuntimeException e) {
            // Fonte fora do ar: usa a última resposta boa salva em disco e avisa a data dela (stale)
            TesouroResponse fallback = fromDisk();
            if (fallback == null) {
                throw e;
            }
            LOG.warn("Tesouro Direto unavailable ({}); using data saved at {}", e.getMessage(), fallback.stale());
            return fallback;
        }
    }

    @CacheResult(cacheName = "tesouro")
    public TesouroResponse fresh() {
        TesouroResponse r = ProviderCall.run("tesouro", "preco-taxa csv", this::download);
        save(r);
        return r;
    }

    private TesouroResponse download() {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL).build();
        HttpRequest req = HttpRequest.newBuilder(URI.create(URL)).timeout(Duration.ofSeconds(20))
                .header("User-Agent", Http.USER_AGENT).GET().build();
        try {
            HttpResponse<InputStream> resp = client.send(req, HttpResponse.BodyHandlers.ofInputStream());
            // Fechar o stream no meio aborta o download do resto do arquivo
            try (BufferedReader in = new BufferedReader(new InputStreamReader(resp.body(), StandardCharsets.ISO_8859_1))) {
                if (resp.statusCode() != 200) {
                    throw new IllegalStateException("HTTP " + resp.statusCode());
                }
                return ler(in);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrompido", e);
        }
    }

    // Função pura (testável): títulos da data base mais recente, parando na primeira linha mais antiga que ela.
    static TesouroResponse ler(BufferedReader in) throws IOException {
        String header = in.readLine();
        if (header == null) {
            throw new IllegalStateException("CSV vazio");
        }
        List<String> cols = Arrays.stream(header.replace("﻿", "").split(";")).map(String::trim).toList();
        int[] idx = new int[COLUNAS.size()];
        for (int i = 0; i < idx.length; i++) {
            idx[i] = cols.indexOf(COLUNAS.get(i));
            if (idx[i] < 0) {
                throw new IllegalStateException("formato do CSV mudou: falta a coluna " + COLUNAS.get(i));
            }
        }
        LocalDate max = null;
        List<TesouroTitulo> out = new ArrayList<>();
        for (String line; (line = in.readLine()) != null; ) {
            String[] f = line.split(";", -1);
            if (f.length < cols.size()) {
                continue;
            }
            LocalDate base;
            try {
                base = LocalDate.parse(f[idx[2]].trim(), BR);
            } catch (DateTimeParseException e) {
                continue;
            }
            if (max != null && base.isBefore(max)) {
                break; // arquivo em ordem decrescente: o resto é histórico
            }
            if (max == null || base.isAfter(max)) {
                max = base;
                out.clear();
            }
            String tipo = f[idx[0]].trim();
            LocalDate venc;
            try {
                venc = LocalDate.parse(f[idx[1]].trim(), BR);
            } catch (DateTimeParseException e) {
                continue;
            }
            out.add(new TesouroTitulo(tipo, venc.toString(), indexador(tipo), tipo.contains("Juros Semestrais"),
                    num(f[idx[3]]), num(f[idx[4]]), num(f[idx[5]]), num(f[idx[6]]), num(f[idx[7]])));
        }
        if (max == null) {
            throw new IllegalStateException("CSV sem linhas válidas");
        }
        out.sort(Comparator.comparing(TesouroTitulo::tipo).thenComparing(TesouroTitulo::vencimento));
        return new TesouroResponse(max.toString(), out, null);
    }

    static String indexador(String tipo) {
        if (tipo.contains("Selic")) return "selic";
        if (tipo.contains("IGPM")) return "igpm";
        if (tipo.contains("Prefixado")) return "pre";
        return "ipca"; // IPCA+, IPCA+ com Juros Semestrais, Educa+ e Renda+ são todos atrelados ao IPCA
    }

    private static Double num(String s) {
        String v = s.trim();
        if (v.isEmpty()) {
            return null;
        }
        try {
            return Double.parseDouble(v.replace(".", "").replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private void save(TesouroResponse r) {
        Map<String, Object> file = new LinkedHashMap<>();
        file.put("saved", Instant.now().getEpochSecond());
        file.put("data", r.data());
        file.put("titulos", r.titulos());
        try {
            mapper.writeValue(diskFile.toFile(), file);
        } catch (IOException e) {
            LOG.warn("Could not save {}: {}", diskFile, e.getMessage());
        }
    }

    private TesouroResponse fromDisk() {
        if (!Files.exists(diskFile)) {
            return null;
        }
        try {
            JsonNode old = mapper.readTree(diskFile.toFile());
            List<TesouroTitulo> titulos = new ArrayList<>();
            for (JsonNode t : old.path("titulos")) {
                titulos.add(mapper.treeToValue(t, TesouroTitulo.class));
            }
            String stale = STALE_FMT.format(Instant.ofEpochSecond(old.path("saved").asLong()).atZone(ZoneId.systemDefault()));
            return new TesouroResponse(old.path("data").asText(), titulos, stale);
        } catch (IOException e) {
            return null;
        }
    }
}
