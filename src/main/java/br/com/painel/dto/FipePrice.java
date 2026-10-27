package br.com.painel.dto;

import java.util.List;

public record FipePrice(String brand, String model, Integer modelYear, String fuel, String codeFipe,
                        String month, Double price, List<FipeMonth> history) {
}
