package br.com.painel.dto;

import java.util.List;
import java.util.Map;

// indices: CDI (cumulative index), IBOV and IFIX; fx and crypto in BRL per unit; ipca: % per month.
public record BenchmarkResponse(String range, Map<String, List<Point>> indices, Map<String, List<Point>> fx,
                                Map<String, List<Point>> crypto, List<RatePoint> ipca, List<String> warnings) {
}
