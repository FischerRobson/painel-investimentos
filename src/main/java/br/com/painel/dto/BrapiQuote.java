package br.com.painel.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

public record BrapiQuote(JsonNode quote, List<Point> points) {
}
