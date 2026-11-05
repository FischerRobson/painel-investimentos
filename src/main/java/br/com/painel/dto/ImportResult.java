package br.com.painel.dto;

import java.util.List;

public record ImportResult(int imported, int skipped, List<String> months) {
}
