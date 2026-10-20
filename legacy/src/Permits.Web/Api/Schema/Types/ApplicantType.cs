using GraphQL.Types;
using Permits.Core.Models;

namespace Permits.Web.Api.Schema.Types
{
    public class ApplicantType : ObjectGraphType<Applicant>
    {
        public ApplicantType()
        {
            Name = "Applicant";

            Field(x => x.FirstName, nullable: true);
            Field(x => x.LastName, nullable: true);
            Field(x => x.Email, nullable: true);
            Field(x => x.Phone, nullable: true);
            Field(x => x.IsSenior);
            Field(x => x.IsNonProfit);
        }
    }
}
