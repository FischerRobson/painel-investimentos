package br.com.painel.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

// A slice of the saved positions in a backup. They travel apart from /api/backup, a few days per request, because all the
// days together would pass the 6 MB payload limit of the Lambda. next: pass it as "after" to get the following slice
// (null on the last one; ignored on import).
public record PositionsBatch(
        @NotNull @Size(max = PositionsBatch.MAX_DAYS) List<@NotNull @Valid PositionsDay> days,
        String next) {

    public static final int MAX_DAYS = 30;
}
