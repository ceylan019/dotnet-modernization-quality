using System;

namespace Permits.Core.Models
{
    public class Applicant
    {
        public int ApplicantId { get; set; }

        public string FirstName { get; set; }

        public string LastName { get; set; }

        public string Email { get; set; }

        public string Phone { get; set; }

        public bool IsSenior { get; set; }

        public bool IsNonProfit { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
