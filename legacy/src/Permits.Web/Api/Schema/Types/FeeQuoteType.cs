using GraphQL.Types;
using Permits.Core.Models;

namespace Permits.Web.Api.Schema.Types
{
    public class FeeQuoteType : ObjectGraphType<FeeQuote>
    {
        public FeeQuoteType()
        {
            Name = "FeeQuote";

            Field(x => x.FeeAmount);
            Field(x => x.HstAmount);
            Field(x => x.TotalAmount);
        }
    }
}
