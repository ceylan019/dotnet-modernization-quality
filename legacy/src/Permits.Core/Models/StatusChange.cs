using System;

namespace Permits.Core.Models
{
    public class StatusChange
    {
        public int HistoryId { get; set; }

        public string FromStatus { get; set; }

        public string ToStatus { get; set; }

        public DateTime ChangedAt { get; set; }

        public string ChangedBy { get; set; }

        public string Note { get; set; }
    }
}
