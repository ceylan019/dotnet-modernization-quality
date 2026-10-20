// Stand-in for the modern app until the conversion replaces it.
// Contract: GET /healthz returns 200 "ok", everything else is 501.
var app = WebApplication.CreateBuilder(args).Build();

app.MapGet("/healthz", () => "ok");
app.MapFallback(() => Results.Content(
    "{\"error\":\"not converted yet\"}", "application/json", null, StatusCodes.Status501NotImplemented));

app.Run();
