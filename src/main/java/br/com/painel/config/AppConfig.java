package br.com.painel.config;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;

import java.util.Optional;

@ConfigMapping(prefix = "painel")
public interface AppConfig {

    Brapi brapi();

    Storage storage();

    Auth auth();

    Snapshot snapshot();

    @WithDefault("cache_taxas.json")
    String ratesCacheFile();

    interface Auth {
        Optional<String> configParam();
    }

    interface Storage {
        @WithDefault("file")
        String type();

        @WithDefault("data")
        String dir();

        Optional<String> bucket();

        @WithDefault("default")
        String owner();
    }

    interface Brapi {
        Optional<String> token();
    }

    interface Snapshot {
        @WithDefault("0 0 18 * * ?")
        String cron();

        @WithDefault("America/Sao_Paulo")
        String zone();

        Optional<String> token();

        @WithDefault("false")
        boolean requireToken();
    }
}
