using System;
using System.Collections.Generic;
using Permits.Core.Models;

namespace Permits.Core
{
    public interface IPermitRepository
    {
        IList<PermitType> GetPermitTypes();

        FeeQuote CalculateFee(string permitTypeCode, decimal areaSqM, bool isSenior, bool isNonProfit);

        DateTime CalculateDueDate(string permitTypeCode, DateTime submittedOn);

        string SubmitApplication(SubmitApplicationRequest request, DateTime submittedOn);

        Application GetByReference(string referenceNumber, DateTime today);

        SearchResult Search(string searchText, ApplicationStatus? status, int page, int pageSize, DateTime today);

        void ChangeStatus(string referenceNumber, ApplicationStatus newStatus, string changedBy, string note, DateTime today);
    }
}
