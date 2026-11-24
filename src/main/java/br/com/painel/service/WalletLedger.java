package br.com.painel.service;

import br.com.painel.model.FixedIncome;
import br.com.painel.model.Operation;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

// The wallet as the result of its operations: quantities of stocks and crypto, fixed income bonds and foreign currencies.
// Reversed operations ("estorno") and the reversals themselves are ignored. Same rules as quantidadesDaCarteira,
// titulosDaCarteira and moedasDaCarteira in src/main/webui/src/motor/operacoes.ts (the page shows the same numbers).
public final class WalletLedger {

    static final Set<String> STOCK_CLASSES = Set.of("acao", "fii", "etf", "bdr", "exterior");
    private static final double EPS = 1e-9;

    // governed: assets with at least one operation (even if reversed): their entries in the wallet come from here
    public record Derived(Map<String, Double> stocks, Map<String, Double> crypto, Map<String, FixedIncome> fixedIncome,
                          Map<String, Double> currencies, Set<String> governedTickers, Set<String> governedBonds,
                          Set<String> governedCurrencies) {
    }

    private WalletLedger() {
    }

    public static List<Operation> effective(List<Operation> ops) {
        Set<String> reversed = ops.stream().filter(o -> "estorno".equals(o.type())).map(Operation::reverses).collect(Collectors.toSet());
        return ops.stream().filter(o -> !"estorno".equals(o.type()) && !reversed.contains(o.id())).toList();
    }

    public static Derived derive(List<Operation> ops) {
        Set<String> governedTickers = new HashSet<>(), governedBonds = new HashSet<>(), governedCurrencies = new HashSet<>();
        for (Operation o : ops) {
            if ("rf".equals(o.assetClass())) {
                governedBonds.add(o.ticker());
            } else if ("moeda".equals(o.assetClass())) {
                governedCurrencies.add(o.ticker());
            } else {
                governedTickers.add(o.ticker());
            }
        }
        List<Operation> eff = effective(ops);
        Map<String, Double> stocks = new LinkedHashMap<>(), crypto = new LinkedHashMap<>();
        stockQuantities(eff, stocks, crypto);
        return new Derived(stocks, crypto, bonds(eff), currencies(eff), governedTickers, governedBonds, governedCurrencies);
    }

    // Per asset and day: corporate events first, then buys, then sells (a sale larger than the position stops at zero)
    private static void stockQuantities(List<Operation> eff, Map<String, Double> stocks, Map<String, Double> crypto) {
        Map<String, List<Operation>> byDay = new TreeMap<>();
        for (Operation o : eff) {
            if (STOCK_CLASSES.contains(o.assetClass()) || "cripto".equals(o.assetClass())) {
                byDay.computeIfAbsent(o.date() + "|" + o.ticker(), k -> new ArrayList<>()).add(o);
            }
        }
        Map<String, Double> qty = new LinkedHashMap<>();
        Map<String, String> assetClass = new LinkedHashMap<>();
        for (List<Operation> day : byDay.values()) {
            String ticker = day.getFirst().ticker();
            assetClass.put(ticker, day.getLast().assetClass());
            double q = qty.getOrDefault(ticker, 0.0);
            for (Operation o : day) {
                switch (o.type()) {
                    case "desdobramento" -> q *= o.factor();
                    case "grupamento" -> q /= o.factor();
                    case "bonificacao" -> q += o.quantity();
                    default -> { }
                }
            }
            double bought = day.stream().filter(o -> "compra".equals(o.type())).mapToDouble(Operation::quantity).sum();
            double sold = day.stream().filter(o -> "venda".equals(o.type())).mapToDouble(Operation::quantity).sum();
            q += bought;
            q -= Math.min(sold, q);
            qty.put(ticker, q < EPS ? 0 : q);
        }
        qty.forEach((t, q) -> {
            if (q > 0) {
                ("cripto".equals(assetClass.get(t)) ? crypto : stocks).put(t, round(q, 8));
            }
        });
    }

    // aplicacao opens a bond with its principal (qtd); resgate takes principal out; at zero the bond leaves the wallet
    private static Map<String, FixedIncome> bonds(List<Operation> eff) {
        Map<String, FixedIncome> out = new LinkedHashMap<>();
        for (Operation o : byDate(eff, "rf")) {
            FixedIncome current = out.get(o.ticker());
            if ("aplicacao".equals(o.type())) {
                if (current != null) {
                    throw new InvalidDataException("o título " + o.ticker() + " já tem uma aplicação: cada aplicação é um título novo");
                }
                Operation.BondTerms b = o.bond();
                out.put(o.ticker(), new FixedIncome(o.ticker(), b.name(), b.kind(), b.index(), b.rate(), round(o.quantity(), 2), o.date(),
                        b.maturity(), Boolean.TRUE.equals(b.taxExempt()), b.institution(), Boolean.TRUE.equals(b.dailyLiquidity())));
            } else if ("resgate".equals(o.type())) {
                if (current == null) {
                    throw new InvalidDataException("resgate de " + o.ticker() + " em " + o.date() + " sem aplicação antes");
                }
                double left = round(current.invested() - o.quantity(), 2);
                if (left <= 0.005) {
                    out.remove(o.ticker());
                } else {
                    out.put(o.ticker(), new FixedIncome(current.id(), current.name(), current.kind(), current.index(), current.rate(), left,
                            current.start(), current.maturity(), current.taxExempt(), current.institution(), current.dailyLiquidity()));
                }
            }
        }
        return out;
    }

    private static Map<String, Double> currencies(List<Operation> eff) {
        Map<String, Double> qty = new LinkedHashMap<>();
        for (Operation o : byDate(eff, "moeda")) {
            double q = qty.getOrDefault(o.ticker(), 0.0);
            q = "compra".equals(o.type()) ? q + o.quantity() : q - Math.min(o.quantity(), q);
            qty.put(o.ticker(), q);
        }
        Map<String, Double> out = new LinkedHashMap<>();
        qty.forEach((c, q) -> {
            if (q > EPS) {
                out.put(c, round(q, 8));
            }
        });
        return out;
    }

    private static List<Operation> byDate(List<Operation> eff, String assetClass) {
        return eff.stream().filter(o -> assetClass.equals(o.assetClass())).sorted(Comparator.comparing(Operation::date)).toList();
    }

    private static double round(double v, int places) {
        double f = Math.pow(10, places);
        return Math.round(v * f) / f;
    }
}
