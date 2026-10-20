<%@ Page Title="Search" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true" CodeBehind="Default.aspx.cs" Inherits="Permits.Web.Default" %>

<asp:Content ID="BodyContent" ContentPlaceHolderID="MainContent" runat="server">
    <h2>Search applications</h2>
    <div class="field">
        <asp:Label ID="SearchTextLabel" runat="server" AssociatedControlID="SearchText" Text="Name or reference" />
        <asp:TextBox ID="SearchText" runat="server" />
    </div>
    <div class="field">
        <asp:Label ID="StatusFilterLabel" runat="server" AssociatedControlID="StatusFilter" Text="Status" />
        <asp:DropDownList ID="StatusFilter" runat="server" />
    </div>
    <asp:Button ID="SearchButton" runat="server" Text="Search" OnClick="SearchButton_Click" />
    <p><asp:Label ID="ResultCount" runat="server" /></p>
    <asp:GridView ID="ResultsGrid" runat="server" AutoGenerateColumns="False" CssClass="grid"
        AllowPaging="True" PageSize="20" OnPageIndexChanging="ResultsGrid_PageIndexChanging">
        <Columns>
            <asp:HyperLinkField DataTextField="ReferenceNumber" DataNavigateUrlFields="ReferenceNumber" DataNavigateUrlFormatString="Detail.aspx?ref={0}" HeaderText="Reference" />
            <asp:TemplateField HeaderText="Applicant">
                <ItemTemplate><%# Server.HtmlEncode(Eval("LastName") + ", " + Eval("FirstName")) %></ItemTemplate>
            </asp:TemplateField>
            <asp:BoundField DataField="PermitTypeName" HeaderText="Permit type" />
            <asp:BoundField DataField="StatusDisplay" HeaderText="Status" />
            <asp:BoundField DataField="SubmittedOn" HeaderText="Submitted" DataFormatString="{0:yyyy-MM-dd}" />
            <asp:BoundField DataField="DueDate" HeaderText="Due" DataFormatString="{0:yyyy-MM-dd}" />
            <asp:BoundField DataField="TotalAmount" HeaderText="Total" DataFormatString="{0:C}" />
        </Columns>
    </asp:GridView>
</asp:Content>
