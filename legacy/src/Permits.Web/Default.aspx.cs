using System;
using System.Linq;
using System.Web.UI;
using System.Web.UI.WebControls;
using Permits.Core;
using Permits.Core.Models;
using Permits.Data;

namespace Permits.Web
{
    public partial class Default : Page
    {
        private PermitService _service = new PermitService(new SqlPermitRepository());

        protected void Page_Load(object sender, EventArgs e)
        {
            if (!IsPostBack)
            {
                StatusFilter.Items.Add(new ListItem("All statuses", ""));
                foreach (ApplicationStatus status in Enum.GetValues(typeof(ApplicationStatus)))
                {
                    StatusFilter.Items.Add(new ListItem(StatusNames.Display(status), status.ToString()));
                }

                BindResults(0);
            }
        }

        protected void SearchButton_Click(object sender, EventArgs e)
        {
            BindResults(0);
        }

        protected void ResultsGrid_PageIndexChanging(object sender, GridViewPageEventArgs e)
        {
            BindResults(e.NewPageIndex);
        }

        private void BindResults(int pageIndex)
        {
            ApplicationStatus? status = null;
            if (StatusFilter.SelectedValue != "")
            {
                status = (ApplicationStatus)Enum.Parse(typeof(ApplicationStatus), StatusFilter.SelectedValue);
            }

            SearchResult result = _service.Search(SearchText.Text.Trim(), status, 1, 100000);

            ResultsGrid.PageIndex = pageIndex;
            ResultsGrid.DataSource = result.Items.Select(i => new
            {
                i.ReferenceNumber,
                i.FirstName,
                i.LastName,
                i.PermitTypeName,
                StatusDisplay = StatusNames.Display(i.Status),
                i.SubmittedOn,
                i.DueDate,
                i.TotalAmount
            }).ToList();
            ResultsGrid.DataBind();

            ResultCount.Text = result.TotalCount + " applications found";
        }
    }
}
