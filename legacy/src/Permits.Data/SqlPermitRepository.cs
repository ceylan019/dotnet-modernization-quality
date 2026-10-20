using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data;
using System.Data.SqlClient;
using Permits.Core;
using Permits.Core.Models;

namespace Permits.Data
{
    public class SqlPermitRepository : IPermitRepository
    {
        private readonly string _connectionString;

        public SqlPermitRepository()
            : this(ConfigurationManager.ConnectionStrings["PermitsDb"].ConnectionString)
        {
        }

        public SqlPermitRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public IList<PermitType> GetPermitTypes()
        {
            var permitTypes = new List<PermitType>();

            using (var connection = new SqlConnection(_connectionString))
            using (var command = new SqlCommand("dbo.usp_ListPermitTypes", connection))
            {
                command.CommandType = CommandType.StoredProcedure;
                connection.Open();

                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        var permitType = new PermitType();
                        permitType.Code = (string)reader["Code"];
                        permitType.Name = (string)reader["Name"];
                        permitType.BaseFee = (decimal)reader["BaseFee"];
                        permitType.RatePerSqM = (decimal)reader["RatePerSqM"];
                        permitType.ReviewBusinessDays = (int)reader["ReviewBusinessDays"];
                        permitTypes.Add(permitType);
                    }
                }
            }

            return permitTypes;
        }

        public FeeQuote CalculateFee(string permitTypeCode, decimal areaSqM, bool isSenior, bool isNonProfit)
        {
            using (var connection = new SqlConnection(_connectionString))
            using (var command = new SqlCommand("dbo.usp_CalculateFee", connection))
            {
                command.CommandType = CommandType.StoredProcedure;
                command.Parameters.Add("@PermitTypeCode", SqlDbType.VarChar, 20).Value = permitTypeCode;
                var area = command.Parameters.Add("@AreaSqM", SqlDbType.Decimal);
                area.Precision = 9;
                area.Scale = 2;
                area.Value = areaSqM;
                command.Parameters.Add("@IsSenior", SqlDbType.Bit).Value = isSenior;
                command.Parameters.Add("@IsNonProfit", SqlDbType.Bit).Value = isNonProfit;

                var fee = command.Parameters.Add("@FeeAmount", SqlDbType.Money);
                fee.Direction = ParameterDirection.Output;
                var hst = command.Parameters.Add("@HstAmount", SqlDbType.Money);
                hst.Direction = ParameterDirection.Output;
                var total = command.Parameters.Add("@TotalAmount", SqlDbType.Money);
                total.Direction = ParameterDirection.Output;

                connection.Open();
                command.ExecuteNonQuery();

                var quote = new FeeQuote();
                quote.FeeAmount = (decimal)fee.Value;
                quote.HstAmount = (decimal)hst.Value;
                quote.TotalAmount = (decimal)total.Value;
                return quote;
            }
        }

        public DateTime CalculateDueDate(string permitTypeCode, DateTime submittedOn)
        {
            using (var connection = new SqlConnection(_connectionString))
            using (var command = new SqlCommand("dbo.usp_CalculateDueDate", connection))
            {
                command.CommandType = CommandType.StoredProcedure;
                command.Parameters.Add("@PermitTypeCode", SqlDbType.VarChar, 20).Value = permitTypeCode;
                command.Parameters.Add("@SubmittedOn", SqlDbType.Date).Value = submittedOn.Date;

                var due = command.Parameters.Add("@DueDate", SqlDbType.Date);
                due.Direction = ParameterDirection.Output;

                connection.Open();
                command.ExecuteNonQuery();

                return (DateTime)due.Value;
            }
        }

        public string SubmitApplication(SubmitApplicationRequest request, DateTime submittedOn)
        {
            using (var connection = new SqlConnection(_connectionString))
            using (var command = new SqlCommand("dbo.usp_SubmitApplication", connection))
            {
                command.CommandType = CommandType.StoredProcedure;
                command.Parameters.Add("@FirstName", SqlDbType.NVarChar, 100).Value = request.FirstName;
                command.Parameters.Add("@LastName", SqlDbType.NVarChar, 100).Value = request.LastName;
                command.Parameters.Add("@Email", SqlDbType.NVarChar, 200).Value = DbValue(request.Email);
                command.Parameters.Add("@Phone", SqlDbType.VarChar, 30).Value = DbValue(request.Phone);
                command.Parameters.Add("@IsSenior", SqlDbType.Bit).Value = request.IsSenior;
                command.Parameters.Add("@IsNonProfit", SqlDbType.Bit).Value = request.IsNonProfit;
                command.Parameters.Add("@PermitTypeCode", SqlDbType.VarChar, 20).Value = request.PermitTypeCode;
                command.Parameters.Add("@SiteAddress", SqlDbType.VarChar, 200).Value = request.SiteAddress;
                var area = command.Parameters.Add("@AreaSqM", SqlDbType.Decimal);
                area.Precision = 9;
                area.Scale = 2;
                area.Value = request.AreaSqM;
                command.Parameters.Add("@Description", SqlDbType.NVarChar, -1).Value = DbValue(request.Description);
                command.Parameters.Add("@SubmittedOn", SqlDbType.Date).Value = submittedOn.Date;

                var reference = command.Parameters.Add("@ReferenceNumber", SqlDbType.VarChar, 20);
                reference.Direction = ParameterDirection.Output;

                connection.Open();
                command.ExecuteNonQuery();

                return (string)reference.Value;
            }
        }

        public Application GetByReference(string referenceNumber, DateTime today)
        {
            Application application = null;

            using (var connection = new SqlConnection(_connectionString))
            {
                connection.Open();

                using (var command = new SqlCommand("dbo.usp_GetApplicationByReference", connection))
                {
                    command.CommandType = CommandType.StoredProcedure;
                    command.Parameters.Add("@ReferenceNumber", SqlDbType.VarChar, 20).Value = referenceNumber;
                    command.Parameters.Add("@Today", SqlDbType.Date).Value = today.Date;

                    using (var reader = command.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            application = new Application();
                            application.ApplicationId = (int)reader["ApplicationId"];
                            application.ReferenceNumber = (string)reader["ReferenceNumber"];
                            application.PermitTypeCode = (string)reader["PermitTypeCode"];
                            application.PermitTypeName = (string)reader["PermitTypeName"];
                            application.SiteAddress = (string)reader["SiteAddress"];
                            application.AreaSqM = (decimal)reader["AreaSqM"];
                            application.Description = reader["Description"] == DBNull.Value ? null : (string)reader["Description"];
                            application.Status = ParseStatus((string)reader["Status"]);
                            application.SubmittedOn = (DateTime)reader["SubmittedOn"];
                            application.SubmittedAt = (DateTime)reader["SubmittedAt"];
                            application.DueDate = (DateTime)reader["DueDate"];
                            application.FeeAmount = (decimal)reader["FeeAmount"];
                            application.HstAmount = (decimal)reader["HstAmount"];
                            application.TotalAmount = (decimal)reader["TotalAmount"];
                            application.LastUpdatedAt = (DateTime)reader["LastUpdatedAt"];

                            var applicant = new Applicant();
                            applicant.ApplicantId = (int)reader["ApplicantId"];
                            applicant.FirstName = (string)reader["FirstName"];
                            applicant.LastName = (string)reader["LastName"];
                            applicant.Email = reader["Email"] == DBNull.Value ? null : (string)reader["Email"];
                            applicant.Phone = reader["Phone"] == DBNull.Value ? null : (string)reader["Phone"];
                            applicant.IsSenior = (bool)reader["IsSenior"];
                            applicant.IsNonProfit = (bool)reader["IsNonProfit"];
                            applicant.CreatedAt = (DateTime)reader["CreatedAt"];
                            application.Applicant = applicant;
                        }
                    }
                }

                if (application == null)
                {
                    return null;
                }

                using (var command = new SqlCommand("dbo.usp_GetStatusHistory", connection))
                {
                    command.CommandType = CommandType.StoredProcedure;
                    command.Parameters.Add("@ReferenceNumber", SqlDbType.VarChar, 20).Value = referenceNumber;

                    using (var reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var change = new StatusChange();
                            change.HistoryId = (int)reader["HistoryId"];
                            change.FromStatus = reader["FromStatus"] == DBNull.Value ? null : (string)reader["FromStatus"];
                            change.ToStatus = (string)reader["ToStatus"];
                            change.ChangedAt = (DateTime)reader["ChangedAt"];
                            change.ChangedBy = (string)reader["ChangedBy"];
                            change.Note = reader["Note"] == DBNull.Value ? null : (string)reader["Note"];
                            application.History.Add(change);
                        }
                    }
                }
            }

            return application;
        }

        public SearchResult Search(string searchText, ApplicationStatus? status, int page, int pageSize, DateTime today)
        {
            var result = new SearchResult();
            result.Page = page;
            result.PageSize = pageSize;

            using (var connection = new SqlConnection(_connectionString))
            using (var command = new SqlCommand("dbo.usp_SearchApplications", connection))
            {
                command.CommandType = CommandType.StoredProcedure;
                command.Parameters.Add("@SearchText", SqlDbType.NVarChar, 100).Value = DbValue(searchText);
                command.Parameters.Add("@Status", SqlDbType.VarChar, 20).Value = status.HasValue ? (object)status.Value.ToString() : DBNull.Value;
                command.Parameters.Add("@Today", SqlDbType.Date).Value = today.Date;
                command.Parameters.Add("@PageNumber", SqlDbType.Int).Value = page;
                command.Parameters.Add("@PageSize", SqlDbType.Int).Value = pageSize;
                connection.Open();

                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        var summary = new ApplicationSummary();
                        summary.ReferenceNumber = (string)reader["ReferenceNumber"];
                        summary.FirstName = (string)reader["FirstName"];
                        summary.LastName = (string)reader["LastName"];
                        summary.PermitTypeCode = (string)reader["PermitTypeCode"];
                        summary.PermitTypeName = (string)reader["PermitTypeName"];
                        summary.Status = ParseStatus((string)reader["Status"]);
                        summary.SubmittedOn = (DateTime)reader["SubmittedOn"];
                        summary.DueDate = (DateTime)reader["DueDate"];
                        summary.TotalAmount = (decimal)reader["TotalAmount"];
                        result.TotalCount = (int)reader["TotalCount"];
                        result.Items.Add(summary);
                    }
                }
            }

            return result;
        }

        public void ChangeStatus(string referenceNumber, ApplicationStatus newStatus, string changedBy, string note, DateTime today)
        {
            using (var connection = new SqlConnection(_connectionString))
            using (var command = new SqlCommand("dbo.usp_ChangeStatus", connection))
            {
                command.CommandType = CommandType.StoredProcedure;
                command.Parameters.Add("@ReferenceNumber", SqlDbType.VarChar, 20).Value = referenceNumber;
                command.Parameters.Add("@NewStatus", SqlDbType.VarChar, 20).Value = newStatus.ToString();
                command.Parameters.Add("@ChangedBy", SqlDbType.NVarChar, 100).Value = changedBy;
                command.Parameters.Add("@Note", SqlDbType.NVarChar, 500).Value = DbValue(note);
                command.Parameters.Add("@Today", SqlDbType.Date).Value = today.Date;

                connection.Open();
                command.ExecuteNonQuery();
            }
        }

        private static object DbValue(string value)
        {
            if (value == null)
            {
                return DBNull.Value;
            }
            return value;
        }

        private static ApplicationStatus ParseStatus(string status)
        {
            return (ApplicationStatus)Enum.Parse(typeof(ApplicationStatus), status);
        }
    }
}
