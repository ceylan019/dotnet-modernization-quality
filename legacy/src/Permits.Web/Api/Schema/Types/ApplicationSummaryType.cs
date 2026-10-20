using GraphQL.Types;
using Permits.Core.Models;

namespace Permits.Web.Api.Schema.Types
{
    public class ApplicationSummaryType : ObjectGraphType<ApplicationSummary>
    {
        public ApplicationSummaryType()
        {
            Name = "ApplicationSummary";

            Field(x => x.ReferenceNumber);
            Field(x => x.FirstName, nullable: true);
            Field(x => x.LastName, nullable: true);
            Field(x => x.PermitTypeCode);
            Field(x => x.PermitTypeName);
            Field<EnumerationGraphType<ApplicationStatus>>("status", resolve: context => context.Source.Status);
            Field<DateGraphType>("submittedOn", resolve: context => context.Source.SubmittedOn);
            Field<DateGraphType>("dueDate", resolve: context => context.Source.DueDate);
            Field(x => x.TotalAmount);
        }
    }
}
