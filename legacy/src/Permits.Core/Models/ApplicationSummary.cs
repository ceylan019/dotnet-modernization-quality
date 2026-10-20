using System;

namespace Permits.Core.Models
{
    public class ApplicationSummary
    {
        public string ReferenceNumber { get; set; }

        public string FirstName { get; set; }

        public string LastName { get; set; }

        public string PermitTypeCode { get; set; }

        public string PermitTypeName { get; set; }

        public ApplicationStatus Status { get; set; }

        public DateTime SubmittedOn { get; set; }

        public DateTime DueDate { get; set; }

        public decimal TotalAmount { get; set; }
    }
}
