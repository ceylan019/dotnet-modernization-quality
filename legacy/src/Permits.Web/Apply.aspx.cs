using System;
using System.Globalization;
using System.Web.UI;
using Permits.Core;
using Permits.Core.Models;
using Permits.Data;

namespace Permits.Web
{
    public partial class Apply : Page
    {
        private PermitService _service = new PermitService(new SqlPermitRepository());

        protected void Page_Load(object sender, EventArgs e)
        {
            if (!IsPostBack)
            {
                PermitType.DataSource = _service.GetPermitTypes();
                PermitType.DataBind();
            }
        }

        protected void PreviewButton_Click(object sender, EventArgs e)
        {
            if (!Page.IsValid)
            {
                return;
            }

            try
            {
                ShowQuote();
            }
            catch (BusinessRuleException ex)
            {
                FeePanel.Visible = false;
                ErrorMessage.Text = Server.HtmlEncode(ex.Message);
            }
        }

        protected void SubmitButton_Click(object sender, EventArgs e)
        {
            if (!Page.IsValid)
            {
                return;
            }

            var request = new SubmitApplicationRequest();
            request.FirstName = FirstName.Text.Trim();
            request.LastName = LastName.Text.Trim();
            request.Email = Email.Text.Trim();
            request.Phone = Phone.Text.Trim();
            request.IsSenior = IsSenior.Checked;
            request.IsNonProfit = IsNonProfit.Checked;
            request.PermitTypeCode = PermitType.SelectedValue;
            request.SiteAddress = SiteAddress.Text.Trim();
            request.AreaSqM = ParseArea();
            request.Description = Description.Text.Trim();

            try
            {
                string reference = _service.Submit(request);
                ReferenceNumber.Text = reference;
                FeePanel.Visible = false;
                ConfirmationPanel.Visible = true;
            }
            catch (BusinessRuleException ex)
            {
                ErrorMessage.Text = Server.HtmlEncode(ex.Message);
            }
        }

        private void ShowQuote()
        {
            decimal area = ParseArea();
            FeeQuote quote = _service.QuoteFee(PermitType.SelectedValue, area, IsSenior.Checked, IsNonProfit.Checked);
            DateTime due = _service.CalculateDueDate(PermitType.SelectedValue, Clock.Today);

            FeeAmount.Text = quote.FeeAmount.ToString("C");
            HstAmount.Text = quote.HstAmount.ToString("C");
            TotalAmount.Text = quote.TotalAmount.ToString("C");
            DueDate.Text = due.ToString("yyyy-MM-dd");
            FeePanel.Visible = true;
        }

        private decimal ParseArea()
        {
            return decimal.Parse(AreaSqM.Text.Trim(), CultureInfo.CurrentCulture);
        }
    }
}
