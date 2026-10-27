package br.com.painel.dto;

import java.util.List;
import java.util.Map;

public record FxResponse(Map<String, FxQuote> quotes, Map<String, List<Point>> history) {
}
