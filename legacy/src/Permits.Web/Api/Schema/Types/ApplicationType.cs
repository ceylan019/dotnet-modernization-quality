using System.Linq;
using GraphQL.Types;
using Permits.Core.Models;

namespace Permits.Web.Api.Schema.Types
{
    public class ApplicationType : ObjectGraphType<Application>
    {
        public ApplicationType()
        {
            Name = "Application";

            Field(x => x.ReferenceNumber);
            Field<ApplicantType>("applicant", resolve: context => context.Source.Applicant);
            Field<PermitTypeType>(
                "permitType",
                resolve: context => PermitsQuery.Service.GetPermitTypes()
                    .FirstOrDefault(t => t.Code == context.Source.PermitTypeCode));
            Field(x => x.SiteAddress);
            Field(x => x.AreaSqM);
            Field(x => x.Description, nullable: true);
            Field<EnumerationGraphType<ApplicationStatus>>("status", resolve: context => context.Source.Status);
            Field<DateGraphType>("submittedOn", resolve: context => context.Source.SubmittedOn);
            Field<DateTimeGraphType>("submittedAt", resolve: context => context.Source.SubmittedAt);
            Field<DateGraphType>("dueDate", resolve: context => context.Source.DueDate);
            Field(x => x.FeeAmount);
            Field(x => x.HstAmount);
            Field(x => x.TotalAmount);
            Field<DateTimeGraphType>("lastUpdatedAt", resolve: context => context.Source.LastUpdatedAt);
            Field<ListGraphType<StatusChangeType>>("history", resolve: context => context.Source.History);
        }
    }
}
