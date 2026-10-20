using System.Collections.Generic;
using System.Text.RegularExpressions;
using Permits.Core.Models;

namespace Permits.Core.Validation
{
    public static class ApplicationValidator
    {
        private static readonly Regex EmailPattern = new Regex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$");

        public static IList<string> Validate(SubmitApplicationRequest request)
        {
            var errors = new List<string>();

            if (request == null)
            {
                errors.Add("Request is required");
                return errors;
            }

            if (string.IsNullOrWhiteSpace(request.FirstName))
                errors.Add("First name is required");
            else if (request.FirstName.Length > 100)
                errors.Add("First name must be at most 100 characters");

            if (string.IsNullOrWhiteSpace(request.LastName))
                errors.Add("Last name is required");
            else if (request.LastName.Length > 100)
                errors.Add("Last name must be at most 100 characters");

            if (!string.IsNullOrEmpty(request.Email) && !EmailPattern.IsMatch(request.Email))
                errors.Add("Email address is not valid");

            if (request.AreaSqM < 1 || request.AreaSqM > 10000)
                errors.Add("Area must be between 1 and 10000 square metres");

            if (string.IsNullOrWhiteSpace(request.SiteAddress))
                errors.Add("Site address is required");
            else if (request.SiteAddress.Length > 200)
                errors.Add("Site address must be at most 200 characters");

            if (string.IsNullOrWhiteSpace(request.PermitTypeCode))
                errors.Add("Permit type is required");

            return errors;
        }
    }
}
