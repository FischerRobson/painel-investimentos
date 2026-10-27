package br.com.painel.dto;

import java.util.List;
import java.util.Map;

// indices: CDI (índice acumulado), IBOV e IFIX; fx e crypto em reais por unidade; ipca: % ao mês.
public record BenchmarkResponse(String range, Map<String, List<Point>> indices, Map<String, List<Point>> fx,
                                Map<String, List<Point>> crypto, List<RatePoint> ipca, List<String> warnings) {
}
