SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE dbo.PermitTypes
(
    Code varchar(20) NOT NULL,
    Name nvarchar(100) NOT NULL,
    BaseFee money NOT NULL,
    RatePerSqM money NOT NULL,
    ReviewBusinessDays int NOT NULL,
    IsActive bit NOT NULL CONSTRAINT DF_PermitTypes_IsActive DEFAULT (1),
    SortHint int NULL,
    CONSTRAINT PK_PermitTypes PRIMARY KEY CLUSTERED (Code)
)
GO

CREATE TABLE dbo.Applicants
(
    ApplicantId int IDENTITY(1,1) NOT NULL,
    FirstName nvarchar(100) NOT NULL,
    LastName nvarchar(100) NOT NULL,
    Email nvarchar(200) NULL,
    Phone varchar(30) NULL,
    IsSenior bit NOT NULL CONSTRAINT DF_Applicants_IsSenior DEFAULT (0),
    IsNonProfit bit NOT NULL CONSTRAINT DF_Applicants_IsNonProfit DEFAULT (0),
    CreatedAt datetime NOT NULL CONSTRAINT DF_Applicants_CreatedAt DEFAULT (GETDATE()),
    CONSTRAINT PK_Applicants PRIMARY KEY CLUSTERED (ApplicantId)
)
GO

CREATE TABLE dbo.Applications
(
    ApplicationId int IDENTITY(1,1) NOT NULL,
    ReferenceNumber varchar(20) NOT NULL,
    ApplicantId int NOT NULL,
    PermitTypeCode varchar(20) NOT NULL,
    SiteAddress varchar(200) NOT NULL,
    AreaSqM decimal(9,2) NOT NULL,
    Description nvarchar(max) NULL,
    Status varchar(20) NOT NULL,
    SubmittedOn date NOT NULL,
    SubmittedAt datetime NOT NULL,
    DueDate date NOT NULL,
    FeeAmount money NOT NULL,
    HstAmount money NOT NULL,
    TotalAmount money NOT NULL,
    LastUpdatedAt datetime NOT NULL,
    CONSTRAINT PK_Applications PRIMARY KEY CLUSTERED (ApplicationId),
    CONSTRAINT UQ_Applications_ReferenceNumber UNIQUE (ReferenceNumber),
    CONSTRAINT FK_Applications_Applicants FOREIGN KEY (ApplicantId) REFERENCES dbo.Applicants (ApplicantId),
    CONSTRAINT FK_Applications_PermitTypes FOREIGN KEY (PermitTypeCode) REFERENCES dbo.PermitTypes (Code),
    CONSTRAINT CK_Applications_Status CHECK (Status IN ('Submitted','UnderReview','InfoRequested','Approved','Rejected'))
)
GO

CREATE TABLE dbo.ApplicationStatusHistory
(
    HistoryId int IDENTITY(1,1) NOT NULL,
    ApplicationId int NOT NULL,
    FromStatus varchar(20) NULL,
    ToStatus varchar(20) NOT NULL,
    ChangedAt datetime NOT NULL,
    ChangedBy nvarchar(100) NOT NULL,
    Note nvarchar(500) NULL,
    CONSTRAINT PK_ApplicationStatusHistory PRIMARY KEY CLUSTERED (HistoryId),
    CONSTRAINT FK_ApplicationStatusHistory_Applications FOREIGN KEY (ApplicationId) REFERENCES dbo.Applications (ApplicationId)
)
GO

CREATE TABLE dbo.Holidays
(
    HolidayDate date NOT NULL,
    Name nvarchar(100) NOT NULL,
    CONSTRAINT PK_Holidays PRIMARY KEY CLUSTERED (HolidayDate)
)
GO

CREATE NONCLUSTERED INDEX IX_Applications_ApplicantId ON dbo.Applications (ApplicantId)
GO
CREATE NONCLUSTERED INDEX IX_ApplicationStatusHistory_ApplicationId ON dbo.ApplicationStatusHistory (ApplicationId)
GO
