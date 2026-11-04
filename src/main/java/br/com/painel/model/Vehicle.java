package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record Vehicle(
        @NotBlank @Size(max = 40) String id,
        @NotNull @Pattern(regexp = "cars|motorcycles|trucks") String type,
        @NotNull @Pattern(regexp = "[\\w-]{1,20}") String brand,
        @NotNull @Pattern(regexp = "[\\w-]{1,20}") String model,
        @NotNull @Pattern(regexp = "[\\w-]{1,20}") String year,
        @JsonProperty("apelido") @Size(max = 40) String nickname,
        Info info,
        LastPrice last,
        @JsonProperty("hist") Map<@Pattern(regexp = Formats.FIPE_MONTH) String, @NotNull @PositiveOrZero Double> history) {

    public record Info(String brand, String model, Integer modelYear, String fuel, String codeFipe) {
    }

    public record LastPrice(String month, Double price) {
    }

    public String label() {
        if (nickname != null && !nickname.isBlank()) {
            return nickname;
        }
        return info != null && info.model() != null ? info.model() : "Veículo";
    }
}
