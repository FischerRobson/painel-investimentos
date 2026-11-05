package br.com.painel.statement;

import br.com.painel.model.BudgetRules;
import br.com.painel.model.DescriptionRule;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public final class DescriptionRules {

    private record Compiled(String match, DescriptionRule rule) {
    }

    private final List<Compiled> rules;

    public DescriptionRules(BudgetRules rules) {
        this.rules = rules.rules().stream()
                .map(r -> new Compiled(ImportKeys.normalize(r.match()), r))
                .filter(c -> !c.match().isEmpty())
                .sorted(Comparator.comparingInt((Compiled c) -> c.match().length()).reversed())
                .toList();
    }

    public Optional<DescriptionRule> match(String description) {
        String text = ImportKeys.normalize(description);
        return rules.stream().filter(c -> text.contains(c.match())).map(Compiled::rule).findFirst();
    }
}
