package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

// When the user last imported a bank statement or credit card bill into the budget (users/{sub}/budget/last-import.json).
// at: ISO instant of the commit; months: months that got new entries.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LastImport(String at, String source, String fileName, int imported, int skipped, List<String> months) {

    public LastImport {
        months = months == null ? List.of() : List.copyOf(months);
    }
}
