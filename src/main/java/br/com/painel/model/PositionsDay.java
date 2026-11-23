package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

// The user's positions at the daily close (18:00 Brasília, B3 trading days only), saved as users/{sub}/positions/AAAA-MM-DD.json.
// previousDate is the trading day the ppv/pnl compare against (null on the first day saved).
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PositionsDay(String date, String previousDate, String takenAt, List<Line> positions, Totals totals) {

    public PositionsDay {
        positions = positions == null ? List.of() : List.copyOf(positions);
    }

    // One holding. Values in BRL.
    //  - kind: stock (ações, FIIs, exterior), crypto, fx (moeda estrangeira) or fixedIncome
    //  - key: kind + ":" + ticker/code/id; matches the same holding across days
    //  - notional: quantity (for fixed income, the amount invested); price: unit price in BRL (for fixed income, the net
    //    value on the curve per real invested); pv = price × notional; ppv = pv on previousDate (0 if it was not held)
    //  - pnl = previous notional × (price − previous price): the price gain only, so buying or selling is not counted as
    //    profit. null when today's or the previous price is unknown.
    //  - currency: quote currency when not BRL (e.g. USD for AAPL); gross and taxRate: fixed income before tax and its IR rate
    //  - staleSince: the price is the last known one, from that date ("" when unknown); missing: no price at all
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Line(String kind, String key, String asset, Double notional, Double price, Double pv, Double ppv, Double pnl,
                       String currency, Double gross, Double taxRate, String staleSince, Boolean missing) {
    }

    public record Totals(double pv, double ppv, double pnl) {
    }
}
