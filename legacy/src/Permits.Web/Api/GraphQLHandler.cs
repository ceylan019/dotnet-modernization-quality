using System.IO;
using System.Threading.Tasks;
using System.Web;
using GraphQL;
using GraphQL.Http;
using Newtonsoft.Json.Linq;
using Permits.Web.Api.Schema;

namespace Permits.Web.Api
{
    public class GraphQLHandler : HttpTaskAsyncHandler
    {
        private static readonly PermitsSchema _schema = new PermitsSchema();
        private static readonly DocumentExecuter _executer = new DocumentExecuter();
        private static readonly DocumentWriter _writer = new DocumentWriter();

        public override async Task ProcessRequestAsync(HttpContext context)
        {
            string body;
            using (var reader = new StreamReader(context.Request.InputStream))
            {
                body = reader.ReadToEnd();
            }

            var request = JObject.Parse(body);
            var variables = request["variables"] as JObject;

            var result = await _executer.ExecuteAsync(options =>
            {
                options.Schema = _schema;
                options.Query = (string)request["query"];
                options.OperationName = (string)request["operationName"];
                options.Inputs = variables != null ? variables.ToInputs() : null;
            });

            context.Response.ContentType = "application/json";
            context.Response.Write(await _writer.WriteToStringAsync(result));
        }
    }
}
