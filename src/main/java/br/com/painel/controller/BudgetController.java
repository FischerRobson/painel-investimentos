package br.com.painel.controller;

import br.com.painel.dto.BudgetMonthSummary;
import br.com.painel.model.BudgetMonth;
import br.com.painel.model.BudgetRules;
import br.com.painel.model.BudgetSettings;
import br.com.painel.model.Formats;
import br.com.painel.service.BudgetService;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;

@Path("/api/budget")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class BudgetController {

    private final BudgetService service;

    public BudgetController(BudgetService service) {
        this.service = service;
    }

    @GET
    @Path("/settings")
    @RunOnVirtualThread
    public Response settings() {
        var v = service.settings();
        return withEtag(Response.ok(v.value()), v.etag());
    }

    @PUT
    @Path("/settings")
    @RunOnVirtualThread
    public Response saveSettings(@Valid @NotNull BudgetSettings settings,
                                 @HeaderParam("If-Match") String ifMatch,
                                 @HeaderParam("If-None-Match") String ifNoneMatch) {
        return saved(service.saveSettings(settings, Preconditions.from(ifMatch, ifNoneMatch)));
    }

    @GET
    @Path("/rules")
    @RunOnVirtualThread
    public Response rules() {
        var v = service.rules();
        return withEtag(Response.ok(v.value()), v.etag());
    }

    @PUT
    @Path("/rules")
    @RunOnVirtualThread
    public Response saveRules(@Valid @NotNull BudgetRules rules,
                              @HeaderParam("If-Match") String ifMatch,
                              @HeaderParam("If-None-Match") String ifNoneMatch) {
        return saved(service.saveRules(rules, Preconditions.from(ifMatch, ifNoneMatch)));
    }

    @GET
    @Path("/months/{month}")
    @RunOnVirtualThread
    public Response month(@PathParam("month") @Pattern(regexp = Formats.YEAR_MONTH) String month) {
        return service.month(YearMonth.parse(month))
                .map(v -> withEtag(Response.ok(v.value()), v.etag()))
                .orElseGet(() -> Response.ok(BudgetMonth.EMPTY).build());
    }

    @PUT
    @Path("/months/{month}")
    @RunOnVirtualThread
    public Response saveMonth(@PathParam("month") @Pattern(regexp = Formats.YEAR_MONTH) String month,
                              @Valid @NotNull BudgetMonth data,
                              @HeaderParam("If-Match") String ifMatch,
                              @HeaderParam("If-None-Match") String ifNoneMatch) {
        return saved(service.saveMonth(YearMonth.parse(month), data, Preconditions.from(ifMatch, ifNoneMatch)));
    }

    @GET
    @Path("/summary")
    @RunOnVirtualThread
    public List<BudgetMonthSummary> summary(@QueryParam("to") @Pattern(regexp = Formats.YEAR_MONTH) String to,
                                            @QueryParam("months") @DefaultValue("12") int months) {
        return service.summary(to == null ? service.currentMonth() : YearMonth.parse(to), months);
    }

    private static Response saved(String etag) {
        return Response.ok(Map.of("etag", etag)).header("ETag", Preconditions.quote(etag)).build();
    }

    private static Response withEtag(Response.ResponseBuilder builder, String etag) {
        return etag == null ? builder.build() : builder.header("ETag", Preconditions.quote(etag)).build();
    }
}
