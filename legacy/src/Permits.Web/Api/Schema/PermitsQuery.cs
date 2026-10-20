using System;
using GraphQL.Types;
using Permits.Core;
using Permits.Core.Models;
using Permits.Data;
using Permits.Web.Api.Schema.Types;

namespace Permits.Web.Api.Schema
{
    public class PermitsQuery : ObjectGraphType
    {
        public static PermitService Service
        {
            get { return new PermitService(new SqlPermitRepository()); }
        }

        public PermitsQuery()
        {
            Name = "Query";

            Field<ListGraphType<PermitTypeType>>(
                "permitTypes",
                resolve: context => Service.GetPermitTypes());

            Field<FeeQuoteType>(
                "feeQuote",
                arguments: new QueryArguments(
                    new QueryArgument<NonNullGraphType<StringGraphType>> { Name = "permitTypeCode" },
                    new QueryArgument<NonNullGraphType<DecimalGraphType>> { Name = "areaSqM" },
                    new QueryArgument<NonNullGraphType<BooleanGraphType>> { Name = "isSenior" },
                    new QueryArgument<NonNullGraphType<BooleanGraphType>> { Name = "isNonProfit" }),
                resolve: context => Service.QuoteFee(
                    context.GetArgument<string>("permitTypeCode"),
                    context.GetArgument<decimal>("areaSqM"),
                    context.GetArgument<bool>("isSenior"),
                    context.GetArgument<bool>("isNonProfit")));

            Field<DateGraphType>(
                "dueDate",
                arguments: new QueryArguments(
                    new QueryArgument<NonNullGraphType<StringGraphType>> { Name = "permitTypeCode" },
                    new QueryArgument<NonNullGraphType<DateGraphType>> { Name = "submittedOn" }),
                resolve: context => Service.CalculateDueDate(
                    context.GetArgument<string>("permitTypeCode"),
                    context.GetArgument<DateTime>("submittedOn")));

            Field<ApplicationType>(
                "application",
                arguments: new QueryArguments(
                    new QueryArgument<NonNullGraphType<StringGraphType>> { Name = "referenceNumber" }),
                resolve: context => Service.GetByReference(context.GetArgument<string>("referenceNumber")));

            Field<ApplicationSearchResultType>(
                "searchApplications",
                arguments: new QueryArguments(
                    new QueryArgument<StringGraphType> { Name = "searchText" },
                    new QueryArgument<EnumerationGraphType<ApplicationStatus>> { Name = "status" },
                    new QueryArgument<IntGraphType> { Name = "page", DefaultValue = 1 },
                    new QueryArgument<IntGraphType> { Name = "pageSize", DefaultValue = 20 }),
                resolve: context => Service.Search(
                    context.GetArgument<string>("searchText"),
                    context.GetArgument<ApplicationStatus?>("status"),
                    context.GetArgument<int>("page", 1),
                    context.GetArgument<int>("pageSize", 20)));
        }
    }
}
