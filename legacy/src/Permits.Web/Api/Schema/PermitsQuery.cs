using GraphQL.Types;
using Permits.Data;
using Permits.Web.Api.Schema.Types;

namespace Permits.Web.Api.Schema
{
    public class PermitsQuery : ObjectGraphType
    {
        public PermitsQuery()
        {
            Name = "Query";

            Field<ListGraphType<PermitTypeType>>(
                "permitTypes",
                resolve: context => new SqlPermitRepository().GetPermitTypes());
        }
    }
}
