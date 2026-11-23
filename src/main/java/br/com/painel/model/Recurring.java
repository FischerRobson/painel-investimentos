package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

// Recurring budget entries (rent, subscriptions, salary...): users/{sub}/budget/recurring.json.
// The page creates each rule's entry when a month is opened (id "rec-{rule}-{month}", so it never duplicates) and records
// it in "generated" (month -> rule ids), so an entry the user deleted is not created again.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Recurring(
        @Size(max = 100) List<@Valid @NotNull Rule> rules,
        Map<@Pattern(regexp = Formats.YEAR_MONTH) String, @Size(max = 100) List<@Pattern(regexp = Formats.ENTRY_ID) String>> generated) {

    public static final Recurring EMPTY = new Recurring(null, null);

    public Recurring {
        rules = rules == null ? List.of() : List.copyOf(rules);
        generated = generated == null ? Map.of() : Map.copyOf(generated);
    }

    // kind: "income" or "expense" (expenses need an area). day: day of the month (a shorter month uses its last day).
    // start/end: first and last month (end empty = no end).
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Rule(
            @NotNull @Pattern(regexp = "[A-Za-z0-9]{1,30}") String id,
            @NotNull @Pattern(regexp = "income|expense") String kind,
            @NotBlank @Size(max = 120) String description,
            @NotNull @Positive @DecimalMax("100000000") Double amount,
            BudgetArea area,
            PaymentMethod method,
            @NotNull @Min(1) @Max(31) Integer day,
            @NotNull @Pattern(regexp = Formats.YEAR_MONTH) String start,
            @Pattern(regexp = Formats.YEAR_MONTH) String end) {
    }
}
