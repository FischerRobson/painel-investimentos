package br.com.painel.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

public record YahooChart(JsonNode meta, List<Point> points) {
}
