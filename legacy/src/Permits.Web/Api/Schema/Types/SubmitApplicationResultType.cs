using System;
using GraphQL.Types;

namespace Permits.Web.Api.Schema.Types
{
    public class SubmitApplicationResult
    {
        public string ReferenceNumber { get; set; }

        public decimal FeeAmount { get; set; }

        public decimal TotalAmount { get; set; }

        public DateTime DueDate { get; set; }
    }

    public class SubmitApplicationResultType : ObjectGraphType<SubmitApplicationResult>
    {
        public SubmitApplicationResultType()
        {
            Name = "SubmitApplicationResult";

            Field(x => x.ReferenceNumber);
            Field(x => x.FeeAmount);
            Field(x => x.TotalAmount);
            Field<DateGraphType>("dueDate", resolve: context => context.Source.DueDate);
        }
    }
}
