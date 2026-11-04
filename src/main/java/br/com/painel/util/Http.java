package br.com.painel.util;

public final class Http {

    // Yahoo and Fundamentus reject requests without a browser User-Agent
    public static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

    private Http() {
    }
}
