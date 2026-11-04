package br.com.painel.dto;

// External source errors come back as HTTP 200 with this body so the page shows the message instead of breaking.
public record ErrorResponse(String error) {
}
