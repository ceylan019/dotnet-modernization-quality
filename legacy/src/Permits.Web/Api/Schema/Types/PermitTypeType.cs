using GraphQL.Types;
using Permits.Core.Models;

namespace Permits.Web.Api.Schema.Types
{
    public class PermitTypeType : ObjectGraphType<PermitType>
    {
        public PermitTypeType()
        {
            Name = "PermitType";

            Field(x => x.Code);
            Field(x => x.Name);
            Field(x => x.BaseFee);
            Field(x => x.RatePerSqM);
            Field(x => x.ReviewBusinessDays);
        }
    }
}
