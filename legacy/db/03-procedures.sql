SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE dbo.usp_ListPermitTypes
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Code, Name, BaseFee, RatePerSqM, ReviewBusinessDays
    FROM dbo.PermitTypes
    WHERE IsActive = 1
END
GO
