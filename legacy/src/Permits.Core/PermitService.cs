using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using Permits.Core.Models;
using Permits.Core.Validation;

namespace Permits.Core
{
    public class PermitService
    {
        private readonly IPermitRepository _repo;

        public PermitService(IPermitRepository repo)
        {
            _repo = repo;
        }

        public IList<PermitType> GetPermitTypes()
        {
            return _repo.GetPermitTypes();
        }

        public FeeQuote QuoteFee(string permitTypeCode, decimal areaSqM, bool isSenior, bool isNonProfit)
        {
            try
            {
                return _repo.CalculateFee(permitTypeCode, areaSqM, isSenior, isNonProfit);
            }
            catch (SqlException ex)
            {
                throw Translate(ex);
            }
        }

        public DateTime CalculateDueDate(string permitTypeCode, DateTime submittedOn)
        {
            try
            {
                return _repo.CalculateDueDate(permitTypeCode, submittedOn);
            }
            catch (SqlException ex)
            {
                throw Translate(ex);
            }
        }

        public string Submit(SubmitApplicationRequest request)
        {
            IList<string> errors = ApplicationValidator.Validate(request);
            if (errors.Count > 0)
            {
                throw new BusinessRuleException("Validation failed: " + string.Join("; ", errors));
            }

            try
            {
                return _repo.SubmitApplication(request, Clock.Today);
            }
            catch (SqlException ex)
            {
                throw Translate(ex);
            }
        }

        public Application GetByReference(string referenceNumber)
        {
            return _repo.GetByReference(referenceNumber, Clock.Today);
        }

        public SearchResult Search(string searchText, ApplicationStatus? status, int page, int pageSize)
        {
            if (page < 1)
            {
                page = 1;
            }
            if (pageSize < 1)
            {
                pageSize = 20;
            }

            return _repo.Search(searchText, status, page, pageSize, Clock.Today);
        }

        public Application ChangeStatus(string referenceNumber, ApplicationStatus newStatus, string changedBy, string note)
        {
            try
            {
                _repo.ChangeStatus(referenceNumber, newStatus, changedBy, note, Clock.Today);
            }
            catch (SqlException ex)
            {
                throw Translate(ex);
            }

            return _repo.GetByReference(referenceNumber, Clock.Today);
        }

        private static Exception Translate(SqlException ex)
        {
            if (ex.Number == 50000)
            {
                return new BusinessRuleException(ex.Message);
            }
            return ex;
        }
    }
}
