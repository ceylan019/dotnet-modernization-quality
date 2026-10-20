<%@ Page Title="Application" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true" CodeBehind="Detail.aspx.cs" Inherits="Permits.Web.Detail" %>

<asp:Content ID="BodyContent" ContentPlaceHolderID="MainContent" runat="server">
    <h2>Application detail</h2>
    <asp:Panel ID="NotFoundPanel" runat="server" Visible="false">
        <p class="error">Application not found.</p>
    </asp:Panel>
    <asp:Panel ID="DetailPanel" runat="server">
        <div class="field"><span class="label">Reference</span> <asp:Label ID="Reference" runat="server" /></div>
        <div class="field"><span class="label">Applicant</span> <span id="MainContent_ApplicantName"><%= ApplicantNameHtml %></span></div>
        <div class="field"><span class="label">Email</span> <asp:Label ID="Email" runat="server" /></div>
        <div class="field"><span class="label">Phone</span> <asp:Label ID="Phone" runat="server" /></div>
        <div class="field"><span class="label">Permit type</span> <asp:Label ID="PermitTypeName" runat="server" /></div>
        <div class="field"><span class="label">Site address</span> <asp:Label ID="SiteAddress" runat="server" /></div>
        <div class="field"><span class="label">Area (sq. m)</span> <asp:Label ID="Area" runat="server" /></div>
        <div class="field"><span class="label">Description</span> <asp:Label ID="Description" runat="server" /></div>
        <div class="field"><span class="label">Status</span> <asp:Label ID="Status" runat="server" /></div>
        <div class="field"><span class="label">Submitted</span> <asp:Label ID="SubmittedOn" runat="server" /></div>
        <div class="field"><span class="label">Due</span> <asp:Label ID="DueDate" runat="server" /></div>
        <div class="field"><span class="label">Fee</span> <asp:Label ID="Fee" runat="server" /></div>
        <div class="field"><span class="label">HST</span> <asp:Label ID="Hst" runat="server" /></div>
        <div class="field"><span class="label">Total</span> <asp:Label ID="Total" runat="server" /></div>

        <h3>History</h3>
        <asp:Repeater ID="HistoryRepeater" runat="server">
            <HeaderTemplate>
                <table class="grid">
                    <tr><th>When</th><th>From</th><th>To</th><th>By</th><th>Note</th></tr>
            </HeaderTemplate>
            <ItemTemplate>
                <tr>
                    <td><%# Eval("ChangedAt", "{0:yyyy-MM-dd HH:mm}") %></td>
                    <td><%# Server.HtmlEncode((string)Eval("FromStatus")) %></td>
                    <td><%# Server.HtmlEncode((string)Eval("ToStatus")) %></td>
                    <td><%# Server.HtmlEncode((string)Eval("ChangedBy")) %></td>
                    <td><%# Server.HtmlEncode((string)Eval("Note")) %></td>
                </tr>
            </ItemTemplate>
            <FooterTemplate>
                </table>
            </FooterTemplate>
        </asp:Repeater>
        <p><asp:HyperLink ID="ReviewLink" runat="server" Text="Review this application" /></p>
    </asp:Panel>
</asp:Content>
