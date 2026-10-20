namespace Permits.Core.Models
{
    public class PermitType
    {
        public string Code { get; set; }

        public string Name { get; set; }

        public decimal BaseFee { get; set; }

        public decimal RatePerSqM { get; set; }

        public int ReviewBusinessDays { get; set; }
    }
}
