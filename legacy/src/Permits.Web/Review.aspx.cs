using System;
using System.Web.UI;
using System.Web.UI.WebControls;
using Permits.Core;
using Permits.Core.Models;
using Permits.Data;

namespace Permits.Web
{
    public partial class Review : Page
    {
        private PermitService _service = new PermitService(new SqlPermitRepository());

        protected void Page_Load(object sender, EventArgs e)
        {
            Application application = _service.GetByReference(Request.QueryString["ref"] ?? "");
            if (application == null)
            {
                NotFoundPanel.Visible = true;
                ReviewPanel.Visible = false;
                return;
            }

            if (!IsPostBack)
            {
                foreach (ApplicationStatus status in Enum.GetValues(typeof(ApplicationStatus)))
                {
                    NewStatus.Items.Add(new ListItem(StatusNames.Display(status), status.ToString()));
                }

                ShowCurrent(application);
            }
        }

        protected void ChangeButton_Click(object sender, EventArgs e)
        {
            var newStatus = (ApplicationStatus)Enum.Parse(typeof(ApplicationStatus), NewStatus.SelectedValue);

            try
            {
                Application updated = _service.ChangeStatus(Request.QueryString["ref"], newStatus, ChangedBy.Text.Trim(), Note.Text.Trim());
                ShowCurrent(updated);
                SuccessMessage.Text = "Status changed to " + StatusNames.Display(updated.Status);
            }
            catch (BusinessRuleException ex)
            {
                ErrorMessage.Text = Server.HtmlEncode(ex.Message);
            }
        }

        private void ShowCurrent(Application application)
        {
            Reference.Text = Server.HtmlEncode(application.ReferenceNumber);
            CurrentStatus.Text = StatusNames.Display(application.Status);
        }
    }
}
