package br.com.painel.controller;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.io.InputStream;

// Todas as páginas são o mesmo index.html; o JavaScript decide o que mostrar pela URL.
@Path("/{page: carteira|projecao|ativos|moedas|bens|custos|glossario}")
public class PageController {

    @GET
    @Produces(MediaType.TEXT_HTML)
    public InputStream page() {
        return Thread.currentThread().getContextClassLoader().getResourceAsStream("META-INF/resources/index.html");
    }
}
