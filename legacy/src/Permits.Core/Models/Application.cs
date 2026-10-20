using System;
using System.Collections.Generic;

namespace Permits.Core.Models
{
    public class Application
    {
        public Application()
        {
            History = new List<StatusChange>();
        }

        public int ApplicationId { get; set; }

        public string ReferenceNumber { get; set; }

        public Applicant Applicant { get; set; }

        public string PermitTypeCode { get; set; }

        public string PermitTypeName { get; set; }

        public string SiteAddress { get; set; }

        public decimal AreaSqM { get; set; }

        public string Description { get; set; }

        public ApplicationStatus Status { get; set; }

        public DateTime SubmittedOn { get; set; }

        public DateTime SubmittedAt { get; set; }

        public DateTime DueDate { get; set; }

        public decimal FeeAmount { get; set; }

        public decimal HstAmount { get; set; }

        public decimal TotalAmount { get; set; }

        public DateTime LastUpdatedAt { get; set; }

        public IList<StatusChange> History { get; set; }
    }
}
