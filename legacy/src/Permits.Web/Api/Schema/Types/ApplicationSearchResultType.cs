using GraphQL.Types;
using Permits.Core.Models;

namespace Permits.Web.Api.Schema.Types
{
    public class ApplicationSearchResultType : ObjectGraphType<SearchResult>
    {
        public ApplicationSearchResultType()
        {
            Name = "ApplicationSearchResult";

            Field(x => x.TotalCount);
            Field(x => x.Page);
            Field(x => x.PageSize);
            Field<ListGraphType<ApplicationSummaryType>>("items", resolve: context => context.Source.Items);
        }
    }
}
