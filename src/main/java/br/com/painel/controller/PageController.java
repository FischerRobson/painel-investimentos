package br.com.painel.controller;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.io.InputStream;

// Every page is the same index.html; the JavaScript picks what to show from the URL.
@Path("/{page: carteira|projecao|ativos|moedas|bens|custos|glossario}")
public class PageController {

    @GET
    @Produces(MediaType.TEXT_HTML)
    public InputStream page() {
        return Thread.currentThread().getContextClassLoader().getResourceAsStream("META-INF/resources/index.html");
    }
}
