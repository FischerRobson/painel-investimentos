package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

// source: null = AwesomeAPI (commercial rate); "bce" = European Central Bank reference rate (fallback).
// stale: when the sources failed and this is the last good answer, the time it was fetched ("dd/MM HH:mm").
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FxResponse(Map<String, FxQuote> quotes, Map<String, List<Point>> history, String source, String stale) {

    public FxResponse(Map<String, FxQuote> quotes, Map<String, List<Point>> history) {
        this(quotes, history, null, null);
    }
}
