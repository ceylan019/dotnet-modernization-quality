using Permits.Core.Models;

namespace Permits.Web
{
    public static class StatusNames
    {
        public static string Display(ApplicationStatus status)
        {
            switch (status)
            {
                case ApplicationStatus.UnderReview:
                    return "Under review";
                case ApplicationStatus.InfoRequested:
                    return "Info requested";
                default:
                    return status.ToString();
            }
        }
    }
}
