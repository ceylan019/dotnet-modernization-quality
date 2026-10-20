<%@ Page Title="Permit types" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true" CodeBehind="Default.aspx.cs" Inherits="Permits.Web.Default" %>

<asp:Content ID="BodyContent" ContentPlaceHolderID="MainContent" runat="server">
    <h2>Permit types</h2>
    <asp:GridView ID="PermitTypesGrid" runat="server" AutoGenerateColumns="False">
        <Columns>
            <asp:BoundField DataField="Code" HeaderText="Code" />
            <asp:BoundField DataField="Name" HeaderText="Name" />
            <asp:BoundField DataField="BaseFee" HeaderText="Base fee" DataFormatString="{0:C}" />
            <asp:BoundField DataField="RatePerSqM" HeaderText="Rate per sq. m" DataFormatString="{0:C}" />
            <asp:BoundField DataField="ReviewBusinessDays" HeaderText="Review days" />
        </Columns>
    </asp:GridView>
</asp:Content>
