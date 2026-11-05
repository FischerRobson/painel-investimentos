package br.com.painel.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public enum PaymentMethod {
    @JsonProperty("creditCard") CREDIT_CARD,
    @JsonProperty("creditPix") CREDIT_PIX,
    @JsonProperty("pix") PIX,
    @JsonProperty("debitCard") DEBIT_CARD,
    @JsonProperty("transfer") TRANSFER,
    @JsonProperty("bill") BILL,
    @JsonProperty("other") OTHER
}
