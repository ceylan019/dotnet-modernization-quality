# Modernization brief: permit applications system

## Background

The city's permit applications system is an ASP.NET Web Forms application on .NET Framework 4.8. It runs on Windows under IIS, exposes a GraphQL API that partner systems call, and keeps its business rules in SQL Server stored procedures and functions. It is to be moved to a cross-platform stack that runs as a Linux container with a PostgreSQL database.

Everything you need is in `legacy/` and in this brief.

## Source

| Folder | Contents |
|---|---|
| `legacy/src/Permits.Web` | Web Forms pages and master page, and the GraphQL endpoint (GraphQL.NET 2.4) at `POST /graphql` |
| `legacy/src/Permits.Core` | Business logic, models, validation |
| `legacy/src/Permits.Data` | ADO.NET data access calling stored procedures |
| `legacy/db` | SQL Server schema, functions, stored procedures and reference data, run in file name order |

## Target

- **Runtime:** .NET 10.
- **UI:** Blazor with static server rendering. Add interactivity only where a page needs it, for example the fee preview on the application form. The same pages, fields, actions and messages as today.
- **API:** Hot Chocolate at `POST /graphql`, with the same request format (a JSON body with `query`, `variables` and `operationName`) and the same operations: the same query and mutation names, arguments, types and fields, so that partner systems keep working without any change on their side.
- **Business logic and data access:** .NET 10 class libraries. Data access calls the converted database functions.
- **Database:** PostgreSQL. Convert the schema and reference data, and convert the stored procedures and functions to PL/pgSQL functions. Business rules stay in the database, where the legacy application keeps them.
- **Data migration:** a script that moves all existing data from the legacy SQL Server database to the PostgreSQL database.
- **Scope:** a like-for-like modernization. No new features, and no changes to business rules.

## Deployment contract

The release pipeline relies on exactly these:

| Item | Requirement |
|---|---|
| Image | `modern/Dockerfile`, built with `modern/` as the build context |
| Port | The container serves HTTP on port 8080 |
| Health | `GET /healthz` returns HTTP 200 when the application is up |
| Database connection | Read from the environment variable `ConnectionStrings__PermitsDb` (an Npgsql connection string) |
| Current date | Optional environment variable `App__FixedToday` (`yyyy-MM-dd`). When set, the application treats that date as today. It replaces the legacy `FixedToday` app setting and behaves the same way |
| Database scripts | `modern/db/`: SQL files that create the schema, functions and reference data on an empty PostgreSQL database when run with `psql` in file name order |
| Data migration | `modern/migration/`: the SQL Server to PostgreSQL migration, runnable from a Linux shell or container |
| Instructions | `modern/README.md`: how to build and run the application, create the database, and run the data migration, with the exact commands and the environment variables each one reads |

## How to work

1. Read the legacy code first. Before converting anything, write `modern/spec/requirements.md` (what the system does today), `modern/spec/design.md` (how each legacy part maps to the target) and `modern/spec/tasks.md` (the ordered conversion tasks).
2. Put everything new under `modern/`. Leave `legacy/` unchanged.
3. Deliver one commit per layer, in this order, each with a conventional commit message: database schema and functions; data access; business logic; API; UI; data migration. The Dockerfile and README can go with the layer they belong to, or in a final commit.
4. Validate your output the way a build pipeline would: the solution compiles, the image builds, the container starts, `/healthz` answers, the pages render, and the GraphQL endpoint answers its operations.
5. Use free and open source packages only, and commit no secrets.
