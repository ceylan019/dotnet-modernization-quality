using System;
using System.Configuration;
using System.Globalization;

namespace Permits.Core
{
    public static class Clock
    {
        public static DateTime Today
        {
            get
            {
                string fixedToday = ConfigurationManager.AppSettings["FixedToday"];
                if (!string.IsNullOrEmpty(fixedToday))
                {
                    return DateTime.ParseExact(fixedToday, "yyyy-MM-dd", CultureInfo.InvariantCulture);
                }

                TimeZoneInfo eastern = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
                return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, eastern).Date;
            }
        }
    }
}
