package br.com.painel.dto;

import java.util.List;

public record ImportPreview(String source, String kind, String billingMonth, List<ImportItem> items) {
}
