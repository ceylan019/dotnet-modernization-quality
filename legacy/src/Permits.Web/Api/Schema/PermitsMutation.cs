using GraphQL.Types;
using Permits.Core.Models;
using Permits.Web.Api.Schema.Types;

namespace Permits.Web.Api.Schema
{
    public class PermitsMutation : ObjectGraphType
    {
        public PermitsMutation()
        {
            Name = "Mutation";

            Field<SubmitApplicationResultType>(
                "submitApplication",
                arguments: new QueryArguments(
                    new QueryArgument<NonNullGraphType<ApplicationInputType>> { Name = "input" }),
                resolve: context =>
                {
                    var request = context.GetArgument<SubmitApplicationRequest>("input");
                    var service = PermitsQuery.Service;
                    var reference = service.Submit(request);
                    var application = service.GetByReference(reference);

                    return new SubmitApplicationResult
                    {
                        ReferenceNumber = application.ReferenceNumber,
                        FeeAmount = application.FeeAmount,
                        TotalAmount = application.TotalAmount,
                        DueDate = application.DueDate
                    };
                });

            Field<ApplicationType>(
                "changeStatus",
                arguments: new QueryArguments(
                    new QueryArgument<NonNullGraphType<StringGraphType>> { Name = "referenceNumber" },
                    new QueryArgument<NonNullGraphType<EnumerationGraphType<ApplicationStatus>>> { Name = "newStatus" },
                    new QueryArgument<NonNullGraphType<StringGraphType>> { Name = "changedBy" },
                    new QueryArgument<StringGraphType> { Name = "note" }),
                resolve: context => PermitsQuery.Service.ChangeStatus(
                    context.GetArgument<string>("referenceNumber"),
                    context.GetArgument<ApplicationStatus>("newStatus"),
                    context.GetArgument<string>("changedBy"),
                    context.GetArgument<string>("note")));
        }
    }
}
