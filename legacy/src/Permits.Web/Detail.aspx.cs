using System;
using System.Web;
using System.Web.UI;
using Permits.Core;
using Permits.Core.Models;
using Permits.Data;

namespace Permits.Web
{
    public partial class Detail : Page
    {
        private PermitService _service = new PermitService(new SqlPermitRepository());

        protected string ApplicantNameHtml = "";

        protected void Page_Load(object sender, EventArgs e)
        {
            Application application = null;

            if (Request.QueryString["id"] != null)
            {
                int id = int.Parse(Request.QueryString["id"]);
                application = FindById(id);
            }
            else if (!string.IsNullOrEmpty(Request.QueryString["ref"]))
            {
                application = _service.GetByReference(Request.QueryString["ref"]);
            }

            if (application == null)
            {
                NotFoundPanel.Visible = true;
                DetailPanel.Visible = false;
                return;
            }

            Bind(application);
        }

        private Application FindById(int id)
        {
            SearchResult result = _service.Search("-" + id.ToString("D6"), null, 1, 1);
            if (result.Items.Count == 0)
            {
                return null;
            }

            return _service.GetByReference(result.Items[0].ReferenceNumber);
        }

        private void Bind(Application a)
        {
            Reference.Text = Server.HtmlEncode(a.ReferenceNumber);
            ApplicantNameHtml = a.Applicant.LastName + ", " + a.Applicant.FirstName;
            Email.Text = Server.HtmlEncode(a.Applicant.Email);
            Phone.Text = Server.HtmlEncode(a.Applicant.Phone);
            PermitTypeName.Text = Server.HtmlEncode(a.PermitTypeName);
            SiteAddress.Text = Server.HtmlEncode(a.SiteAddress);
            Area.Text = a.AreaSqM.ToString("0.##");
            Description.Text = Server.HtmlEncode(a.Description);
            Status.Text = StatusNames.Display(a.Status);
            SubmittedOn.Text = a.SubmittedOn.ToString("yyyy-MM-dd");
            DueDate.Text = a.DueDate.ToString("yyyy-MM-dd");
            Fee.Text = a.FeeAmount.ToString("C");
            Hst.Text = a.HstAmount.ToString("C");
            Total.Text = a.TotalAmount.ToString("C");
            HistoryRepeater.DataSource = a.History;
            HistoryRepeater.DataBind();
            ReviewLink.NavigateUrl = "Review.aspx?ref=" + HttpUtility.UrlEncode(a.ReferenceNumber);
        }
    }
}
