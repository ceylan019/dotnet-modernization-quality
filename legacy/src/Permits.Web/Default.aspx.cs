using System;
using System.Web.UI;
using Permits.Data;

namespace Permits.Web
{
    public partial class Default : Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            if (!IsPostBack)
            {
                var repository = new SqlPermitRepository();
                PermitTypesGrid.DataSource = repository.GetPermitTypes();
                PermitTypesGrid.DataBind();
            }
        }
    }
}
