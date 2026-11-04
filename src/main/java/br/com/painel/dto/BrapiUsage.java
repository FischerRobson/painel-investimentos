package br.com.painel.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

// window is "rolling-30d" (last 30 calendar days) or "billing-cycle"; start and end are ISO dates of that window.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record BrapiUsage(boolean enabled,
                         @JsonProperty("plano") String plan,
                         @JsonProperty("limite") Long limit,
                         @JsonProperty("usado") Long used,
                         @JsonProperty("restante") Long remaining,
                         @JsonProperty("janela") String window,
                         @JsonProperty("inicio") String start,
                         @JsonProperty("fim") String end,
                         Long fetchedAt) {

    public static final BrapiUsage DISABLED = new BrapiUsage(false, null, null, null, null, null, null, null, null);
}
