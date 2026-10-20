using GraphQL.Types;
using Permits.Core.Models;

namespace Permits.Web.Api.Schema.Types
{
    public class StatusChangeType : ObjectGraphType<StatusChange>
    {
        public StatusChangeType()
        {
            Name = "StatusChange";

            Field(x => x.FromStatus, nullable: true);
            Field(x => x.ToStatus);
            Field<DateTimeGraphType>("changedAt", resolve: context => context.Source.ChangedAt);
            Field(x => x.ChangedBy);
            Field(x => x.Note, nullable: true);
        }
    }
}
