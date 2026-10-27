package br.com.painel.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record Bem(
        @NotBlank @Size(max = 40) String id,
        @NotNull @Pattern(regexp = "cars|motorcycles|trucks") String type,
        @NotNull @Pattern(regexp = "[\\w-]{1,20}") String brand,
        @NotNull @Pattern(regexp = "[\\w-]{1,20}") String model,
        @NotNull @Pattern(regexp = "[\\w-]{1,20}") String year,
        @Size(max = 40) String apelido,
        Info info,
        Ultimo last,
        // valor FIPE de cada mês já consultado: "outubro de 2026" → 84753.0
        Map<@Pattern(regexp = Datas.MES_FIPE) String, @NotNull @PositiveOrZero Double> hist) {

    public record Info(String brand, String model, Integer modelYear, String fuel, String codeFipe) {
    }

    public record Ultimo(String month, Double price) {
    }
}
