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
