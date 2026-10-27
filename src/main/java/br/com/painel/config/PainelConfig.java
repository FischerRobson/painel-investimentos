package br.com.painel.config;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;

import java.util.Optional;

@ConfigMapping(prefix = "painel")
public interface PainelConfig {

    Brapi brapi();

    Storage storage();

    Auth auth();

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
}
