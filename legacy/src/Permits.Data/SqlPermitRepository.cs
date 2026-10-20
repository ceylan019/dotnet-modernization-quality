using System.Collections.Generic;
using System.Configuration;
using System.Data;
using System.Data.SqlClient;
using Permits.Core.Models;

namespace Permits.Data
{
    public class SqlPermitRepository
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
    }
}
