package br.com.painel.service;

import br.com.painel.config.PainelConfig;
import br.com.painel.dto.RatePoint;
import br.com.painel.dto.RatesResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@ApplicationScoped
public class RatesService {

    private static final Logger LOG = Logger.getLogger(RatesService.class);
    private static final DateTimeFormatter STALE_FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    private final BcbService bcb;
    private final ObjectMapper mapper;
    private final Path diskFile;

    public RatesService(BcbService bcb, ObjectMapper mapper, PainelConfig config) {
        this.bcb = bcb;
        this.mapper = mapper;
        this.diskFile = Path.of(config.ratesCacheFile());
    }

    public RatesResponse rates(LocalDate start) {
        // o IPCA é mensal
        LocalDate monthStart = start.withDayOfMonth(1);
        try {
            return fresh(monthStart);
        } catch (RuntimeException e) {
            // BCB fora do ar: usa a última resposta boa salva em disco e avisa a data (stale)
            RatesResponse fallback = fromDisk(monthStart);
            if (fallback == null) {
                throw e;
            }
            LOG.warnf("Banco Central indisponível (%s); usando taxas salvas em %s", e.getMessage(), fallback.stale());
            return fallback;
        }
    }

    @CacheResult(cacheName = "rates")
    public RatesResponse fresh(LocalDate monthStart) {
        RatesResponse r = new RatesResponse(bcb.series(BcbService.CDI, monthStart), bcb.series(BcbService.IPCA, monthStart), null);
        save(monthStart, r);
        return r;
    }

    private void save(LocalDate start, RatesResponse r) {
        Map<String, Object> file = new LinkedHashMap<>();
        file.put("start", start.toString());
        file.put("saved", Instant.now().getEpochSecond());
        file.put("cdi", r.cdi());
        file.put("ipca", r.ipca());
        try {
            mapper.writeValue(diskFile.toFile(), file);
        } catch (IOException e) {
            LOG.warnf("Não consegui salvar %s: %s", diskFile, e.getMessage());
        }
    }

    private RatesResponse fromDisk(LocalDate start) {
        if (!Files.exists(diskFile)) {
            return null;
        }
        try {
            JsonNode old = mapper.readTree(diskFile.toFile());
            String iso = start.toString();
            if (old.path("start").asText().compareTo(iso) > 0) {
                return null;
            }
            String stale = STALE_FMT.format(Instant.ofEpochSecond((long) old.path("saved").asDouble()).atZone(ZoneId.systemDefault()));
            return new RatesResponse(since(old.path("cdi"), iso), since(old.path("ipca"), iso), stale);
        } catch (IOException e) {
            return null;
        }
    }

    private static List<RatePoint> since(JsonNode rows, String iso) {
        List<RatePoint> out = new ArrayList<>();
        for (JsonNode r : rows) {
            if (r.path(0).asText().compareTo(iso) >= 0) {
                out.add(new RatePoint(r.path(0).asText(), r.path(1).asDouble()));
            }
        }
        return out;
    }
}
