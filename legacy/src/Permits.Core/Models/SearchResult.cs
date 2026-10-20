using System.Collections.Generic;

namespace Permits.Core.Models
{
    public class SearchResult
    {
        public SearchResult()
        {
            Items = new List<ApplicationSummary>();
        }

        public IList<ApplicationSummary> Items { get; set; }

        public int TotalCount { get; set; }

        public int Page { get; set; }

        public int PageSize { get; set; }
    }
}
