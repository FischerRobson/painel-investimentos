package br.com.painel.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

// idx: cdi (taxa = % do CDI), pre (taxa = % a.a.) ou ipca (taxa = IPCA + % a.a.)
public record TituloRf(
        @NotBlank @Size(max = 40) String id,
        @NotBlank @Size(max = 80) String nome,
        @NotBlank @Size(max = 40) String tipo,
        @NotNull @Pattern(regexp = "cdi|pre|ipca") String idx,
        @NotNull @PositiveOrZero Double taxa,
        @NotNull @PositiveOrZero Double aplicado,
        @NotNull @Pattern(regexp = Datas.ISO) String data,
        @Pattern(regexp = Datas.ISO) String venc,
        boolean isento) {
}
