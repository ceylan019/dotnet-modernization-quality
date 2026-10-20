<%@ Page Title="New application" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true" CodeBehind="Apply.aspx.cs" Inherits="Permits.Web.Apply" %>

<asp:Content ID="BodyContent" ContentPlaceHolderID="MainContent" runat="server">
    <h2>New permit application</h2>
    <asp:ValidationSummary ID="ValidationSummary" runat="server" ForeColor="#ff0000" HeaderText="Please correct the following:" />
    <asp:Label ID="ErrorMessage" runat="server" CssClass="error" EnableViewState="false" />

    <div class="field">
        <label for="MainContent_FirstName">First name</label>
        <asp:TextBox ID="FirstName" runat="server" MaxLength="100" />
        <asp:RequiredFieldValidator ID="FirstNameRequired" runat="server" ControlToValidate="FirstName" Display="Dynamic" ErrorMessage="First name is required" Text="*" />
    </div>
    <div class="field">
        <label for="MainContent_LastName">Last name</label>
        <asp:TextBox ID="LastName" runat="server" MaxLength="100" />
        <asp:RequiredFieldValidator ID="LastNameRequired" runat="server" ControlToValidate="LastName" Display="Dynamic" ErrorMessage="Last name is required" Text="*" />
    </div>
    <div class="field">
        <label for="MainContent_Email">Email</label>
        <asp:TextBox ID="Email" runat="server" />
        <asp:RegularExpressionValidator ID="EmailFormat" runat="server" ControlToValidate="Email" Display="Dynamic" ValidationExpression="^[^@\s]+@[^@\s]+\.[^@\s]+$" ErrorMessage="Email address is not valid" Text="*" />
    </div>
    <div class="field">
        <span class="label">Phone</span>
        <asp:TextBox ID="Phone" runat="server" />
    </div>
    <div class="field">
        <asp:CheckBox ID="IsSenior" runat="server" Text="Senior applicant" />
    </div>
    <div class="field">
        <asp:CheckBox ID="IsNonProfit" runat="server" Text="Non-profit organization" />
    </div>
    <div class="field">
        <label for="MainContent_PermitType">Permit type</label>
        <asp:DropDownList ID="PermitType" runat="server" DataTextField="Name" DataValueField="Code" />
    </div>
    <div class="field">
        <label for="MainContent_SiteAddress">Site address</label>
        <asp:TextBox ID="SiteAddress" runat="server" MaxLength="200" />
        <asp:RequiredFieldValidator ID="SiteAddressRequired" runat="server" ControlToValidate="SiteAddress" Display="Dynamic" ErrorMessage="Site address is required" Text="*" />
    </div>
    <div class="field">
        <label for="MainContent_AreaSqM">Area (sq. m)</label>
        <asp:TextBox ID="AreaSqM" runat="server" />
        <asp:RequiredFieldValidator ID="AreaRequired" runat="server" ControlToValidate="AreaSqM" Display="Dynamic" ErrorMessage="Area is required" Text="*" />
        <asp:RangeValidator ID="AreaRange" runat="server" ControlToValidate="AreaSqM" Type="Double" MinimumValue="1" MaximumValue="10000" Display="Dynamic" ErrorMessage="Area must be between 1 and 10000 square metres" Text="*" />
    </div>
    <div class="field">
        <label for="MainContent_Description">Description</label>
        <asp:TextBox ID="Description" runat="server" TextMode="MultiLine" Rows="3" Columns="40" />
    </div>
    <asp:Button ID="PreviewButton" runat="server" Text="Preview fee" OnClick="PreviewButton_Click" />

    <asp:Panel ID="FeePanel" runat="server" Visible="false">
        <h3>Fee estimate</h3>
        <div class="field"><span class="label">Fee</span> <asp:Label ID="FeeAmount" runat="server" /></div>
        <div class="field"><span class="label">HST</span> <asp:Label ID="HstAmount" runat="server" /></div>
        <div class="field"><span class="label">Total</span> <asp:Label ID="TotalAmount" runat="server" /></div>
        <div class="field"><span class="label">Due date</span> <asp:Label ID="DueDate" runat="server" /></div>
        <asp:Button ID="SubmitButton" runat="server" Text="Submit application" OnClick="SubmitButton_Click" />
    </asp:Panel>

    <asp:Panel ID="ConfirmationPanel" runat="server" Visible="false">
        <h3>Application received</h3>
        <p>Your reference number is <asp:Label ID="ReferenceNumber" runat="server" />.</p>
    </asp:Panel>
</asp:Content>
