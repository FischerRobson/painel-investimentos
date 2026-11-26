package br.com.painel.dto;

// Um título do Tesouro Direto na data base mais recente do CSV oficial (Tesouro Transparente).
// indexador: "selic", "ipca", "pre" ou "igpm". Taxas em % a.a.; PU em reais. Compra = o investidor aplica; venda = resgata.
public record TesouroTitulo(String tipo, String vencimento, String indexador, boolean jurosSemestrais,
                            Double taxaCompra, Double taxaVenda, Double puCompra, Double puVenda, Double puBase) {
}
