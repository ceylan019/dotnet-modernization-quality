using GraphQL.Types;

namespace Permits.Web.Api.Schema.Types
{
    public class ApplicationInputType : InputObjectGraphType
    {
        public ApplicationInputType()
        {
            Name = "ApplicationInput";

            Field<NonNullGraphType<StringGraphType>>("firstName");
            Field<NonNullGraphType<StringGraphType>>("lastName");
            Field<StringGraphType>("email");
            Field<StringGraphType>("phone");
            Field<NonNullGraphType<BooleanGraphType>>("isSenior");
            Field<NonNullGraphType<BooleanGraphType>>("isNonProfit");
            Field<NonNullGraphType<StringGraphType>>("permitTypeCode");
            Field<NonNullGraphType<StringGraphType>>("siteAddress");
            Field<NonNullGraphType<DecimalGraphType>>("areaSqM");
            Field<StringGraphType>("description");
        }
    }
}
