namespace Permits.Core.Models
{
    public class SubmitApplicationRequest
    {
        public string FirstName { get; set; }

        public string LastName { get; set; }

        public string Email { get; set; }

        public string Phone { get; set; }

        public bool IsSenior { get; set; }

        public bool IsNonProfit { get; set; }

        public string PermitTypeCode { get; set; }

        public string SiteAddress { get; set; }

        public decimal AreaSqM { get; set; }

        public string Description { get; set; }
    }
}
