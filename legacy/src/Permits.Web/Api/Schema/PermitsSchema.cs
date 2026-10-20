namespace Permits.Web.Api.Schema
{
    public class PermitsSchema : GraphQL.Types.Schema
    {
        public PermitsSchema()
        {
            Query = new PermitsQuery();
            Mutation = new PermitsMutation();
        }
    }
}
