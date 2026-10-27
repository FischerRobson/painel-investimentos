package br.com.painel.dto;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class StockItem {

    public String ticker;
    public String symbol;
    public Map<String, String> sources = new LinkedHashMap<>();
    public List<String> warnings = new ArrayList<>();
    public List<Point> points = new ArrayList<>();
    public String error;

    public String name;
    public String logo;
    public String type;
    public String currency;
    public String sector;
    public String industry;
    public String summary;
    public String website;

    public Double price;
    public Double change;
    public Double changePct;
    public Double open;
    public Double prevClose;
    public Double dayHigh;
    public Double dayLow;
    public Double volume;
    public Double marketCap;
    public Double high52;
    public Double low52;

    public List<Dividend> dividends = new ArrayList<>();
    public Double div12m;
    public Double dy12m;
    public Double pe;
    public Double pvp;
    public Fundamentals fund;

    // hora (ms) da cotação usada e se alguma fonte está vencida (fonte fora do ar)
    public Long fetchedAt;
    public boolean stale;

    public StockItem(String ticker, String symbol) {
        this.ticker = ticker;
        this.symbol = symbol;
    }
}
