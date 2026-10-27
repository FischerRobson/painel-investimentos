package br.com.painel.dto;

import java.util.List;

public record DataResponse(String range, List<StockItem> items, BrapiInfo brapi) {
}
