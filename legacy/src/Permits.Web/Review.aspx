<%@ Page Title="Review" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true" CodeBehind="Review.aspx.cs" Inherits="Permits.Web.Review" %>

<asp:Content ID="BodyContent" ContentPlaceHolderID="MainContent" runat="server">
    <h2>Review application</h2>
    <asp:Panel ID="NotFoundPanel" runat="server" Visible="false">
        <p class="error">Application not found.</p>
    </asp:Panel>
    <asp:Panel ID="ReviewPanel" runat="server">
        <div class="field"><span class="label">Reference</span> <asp:Label ID="Reference" runat="server" /></div>
        <div class="field"><span class="label">Current status</span> <asp:Label ID="CurrentStatus" runat="server" /></div>
        <div class="field">
            <label for="MainContent_NewStatus">New status</label>
            <asp:DropDownList ID="NewStatus" runat="server" />
        </div>
        <div class="field">
            <label for="MainContent_ChangedBy">Changed by</label>
            <asp:TextBox ID="ChangedBy" runat="server" MaxLength="100" />
        </div>
        <div class="field">
            <label for="MainContent_Note">Note</label>
            <asp:TextBox ID="Note" runat="server" TextMode="MultiLine" Rows="3" Columns="40" />
        </div>
        <asp:Button ID="ChangeButton" runat="server" Text="Change status" OnClick="ChangeButton_Click" />
        <p><asp:Label ID="ErrorMessage" runat="server" ForeColor="#ff0000" EnableViewState="false" /></p>
        <p><asp:Label ID="SuccessMessage" runat="server" CssClass="success" EnableViewState="false" /></p>
    </asp:Panel>
</asp:Content>
