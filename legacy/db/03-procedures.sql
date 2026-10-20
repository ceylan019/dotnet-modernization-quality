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

CREATE PROCEDURE dbo.usp_CalculateFee
    @PermitTypeCode varchar(20),
    @AreaSqM decimal(9,2),
    @IsSenior bit,
    @IsNonProfit bit,
    @FeeAmount money OUTPUT,
    @HstAmount money OUTPUT,
    @TotalAmount money OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @base money, @rate money, @raw money

    SELECT @base = BaseFee, @rate = RatePerSqM
    FROM dbo.PermitTypes
    WHERE Code = @PermitTypeCode AND IsActive = 1

    IF @base IS NULL
    BEGIN
        RAISERROR('Unknown or inactive permit type %s', 16, 1, @PermitTypeCode)
        RETURN
    END

    IF @AreaSqM < 1 OR @AreaSqM > 10000
    BEGIN
        RAISERROR('Area must be between 1 and 10000 square metres', 16, 1)
        RETURN
    END

    SET @raw = @base + @rate * @AreaSqM

    IF @IsNonProfit = 1
        SET @raw = @raw * 0.50
    ELSE IF @IsSenior = 1
        SET @raw = @raw * 0.75

    SET @FeeAmount = ROUND(@raw, 2)
    SET @HstAmount = ROUND(@FeeAmount * 0.13, 2)
    SET @TotalAmount = @FeeAmount + @HstAmount
END
GO

CREATE PROCEDURE dbo.usp_CalculateDueDate
    @PermitTypeCode varchar(20),
    @SubmittedOn date,
    @DueDate date OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @days int

    SELECT @days = ReviewBusinessDays
    FROM dbo.PermitTypes
    WHERE Code = @PermitTypeCode AND IsActive = 1

    IF @days IS NULL
    BEGIN
        RAISERROR('Unknown or inactive permit type %s', 16, 1, @PermitTypeCode)
        RETURN
    END

    SET @DueDate = dbo.fn_AddBusinessDays(@SubmittedOn, @days)
END
GO

CREATE PROCEDURE dbo.usp_SubmitApplication
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(200) = NULL,
    @Phone varchar(30) = NULL,
    @IsSenior bit,
    @IsNonProfit bit,
    @PermitTypeCode varchar(20),
    @SiteAddress varchar(200),
    @AreaSqM decimal(9,2),
    @Description nvarchar(max) = NULL,
    @SubmittedOn date,
    @ReferenceNumber varchar(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @fee money, @hst money, @total money
    DECLARE @due date
    DECLARE @applicantId int, @id int
    DECLARE @now datetime = GETDATE()

    BEGIN TRY
        BEGIN TRANSACTION

        EXEC dbo.usp_CalculateFee @PermitTypeCode, @AreaSqM, @IsSenior, @IsNonProfit, @fee OUTPUT, @hst OUTPUT, @total OUTPUT
        EXEC dbo.usp_CalculateDueDate @PermitTypeCode, @SubmittedOn, @due OUTPUT

        INSERT INTO dbo.Applicants (FirstName, LastName, Email, Phone, IsSenior, IsNonProfit)
        VALUES (@FirstName, @LastName, @Email, @Phone, @IsSenior, @IsNonProfit)
        SET @applicantId = SCOPE_IDENTITY()

        INSERT INTO dbo.Applications
            (ReferenceNumber, ApplicantId, PermitTypeCode, SiteAddress, AreaSqM, Description, Status,
             SubmittedOn, SubmittedAt, DueDate, FeeAmount, HstAmount, TotalAmount, LastUpdatedAt)
        VALUES
            (LEFT(CONVERT(varchar(36), NEWID()), 20), @applicantId, @PermitTypeCode, @SiteAddress, @AreaSqM, @Description, 'Submitted',
             @SubmittedOn, @now, @due, @fee, @hst, @total, @now)
        SET @id = SCOPE_IDENTITY()

        SET @ReferenceNumber = 'PRM-' + CONVERT(char(4), YEAR(@SubmittedOn)) + '-' + RIGHT('000000' + CONVERT(varchar(10), @id), 6)

        UPDATE dbo.Applications SET ReferenceNumber = @ReferenceNumber WHERE ApplicationId = @id

        INSERT INTO dbo.ApplicationStatusHistory (ApplicationId, FromStatus, ToStatus, ChangedAt, ChangedBy, Note)
        VALUES (@id, NULL, 'Submitted', @now, N'applicant', NULL)

        COMMIT TRANSACTION
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

CREATE PROCEDURE dbo.usp_ChangeStatus
    @ReferenceNumber varchar(20),
    @NewStatus varchar(20),
    @ChangedBy nvarchar(100),
    @Note nvarchar(500) = NULL,
    @Today date
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @id int, @current varchar(20), @updated datetime
    DECLARE @now datetime = GETDATE()

    SELECT @id = ApplicationId, @current = Status, @updated = LastUpdatedAt
    FROM dbo.Applications
    WHERE ReferenceNumber = @ReferenceNumber

    IF @id IS NULL
    BEGIN
        RAISERROR('Application %s not found', 16, 1, @ReferenceNumber)
        RETURN
    END

    IF dbo.fn_EffectiveStatus(@current, @updated, @Today) = 'Expired'
    BEGIN
        RAISERROR('Application %s has expired', 16, 1, @ReferenceNumber)
        RETURN
    END

    IF NOT (   (@current = 'Submitted' AND @NewStatus = 'UnderReview')
            OR (@current = 'UnderReview' AND @NewStatus IN ('InfoRequested', 'Approved', 'Rejected'))
            OR (@current = 'InfoRequested' AND @NewStatus = 'UnderReview'))
    BEGIN
        RAISERROR('Invalid status transition from %s to %s', 16, 1, @current, @NewStatus)
        RETURN
    END

    IF @NewStatus IN ('Rejected', 'InfoRequested') AND (@Note IS NULL OR LTRIM(RTRIM(@Note)) = '')
    BEGIN
        RAISERROR('A note is required when status is %s', 16, 1, @NewStatus)
        RETURN
    END

    BEGIN TRY
        BEGIN TRANSACTION

        UPDATE dbo.Applications SET Status = @NewStatus, LastUpdatedAt = @now WHERE ApplicationId = @id

        INSERT INTO dbo.ApplicationStatusHistory (ApplicationId, FromStatus, ToStatus, ChangedAt, ChangedBy, Note)
        VALUES (@id, @current, @NewStatus, @now, @ChangedBy, @Note)

        COMMIT TRANSACTION
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

CREATE PROCEDURE dbo.usp_SearchApplications
    @SearchText nvarchar(100) = NULL,
    @Status varchar(20) = NULL,
    @Today date,
    @PageNumber int = 1,
    @PageSize int = 20
AS
BEGIN
    SET NOCOUNT ON;

    SELECT a.ReferenceNumber, p.FirstName, p.LastName, a.PermitTypeCode, t.Name AS PermitTypeName,
           dbo.fn_EffectiveStatus(a.Status, a.LastUpdatedAt, @Today) AS Status,
           a.SubmittedOn, a.DueDate, a.TotalAmount,
           COUNT(*) OVER() AS TotalCount
    FROM dbo.Applications a
    INNER JOIN dbo.Applicants p ON p.ApplicantId = a.ApplicantId
    INNER JOIN dbo.PermitTypes t ON t.Code = a.PermitTypeCode
    WHERE (@SearchText IS NULL OR @SearchText = ''
           OR p.FirstName LIKE '%' + @SearchText + '%'
           OR p.LastName LIKE '%' + @SearchText + '%'
           OR a.ReferenceNumber LIKE '%' + @SearchText + '%')
      AND (@Status IS NULL OR @Status = ''
           OR dbo.fn_EffectiveStatus(a.Status, a.LastUpdatedAt, @Today) = @Status)
    ORDER BY a.SubmittedAt DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
END
GO

CREATE PROCEDURE dbo.usp_GetApplicationByReference
    @ReferenceNumber varchar(20),
    @Today date
AS
BEGIN
    SET NOCOUNT ON;

    SELECT a.ApplicationId, a.ReferenceNumber, a.ApplicantId, a.PermitTypeCode, a.SiteAddress, a.AreaSqM,
           a.Description,
           dbo.fn_EffectiveStatus(a.Status, a.LastUpdatedAt, @Today) AS Status,
           a.SubmittedOn, a.SubmittedAt, a.DueDate, a.FeeAmount, a.HstAmount, a.TotalAmount, a.LastUpdatedAt,
           p.FirstName, p.LastName, p.Email, p.Phone, p.IsSenior, p.IsNonProfit, p.CreatedAt,
           t.Name AS PermitTypeName, t.BaseFee, t.RatePerSqM, t.ReviewBusinessDays
    FROM dbo.Applications a
    INNER JOIN dbo.Applicants p ON p.ApplicantId = a.ApplicantId
    INNER JOIN dbo.PermitTypes t ON t.Code = a.PermitTypeCode
    WHERE a.ReferenceNumber = @ReferenceNumber
END
GO

CREATE PROCEDURE dbo.usp_GetStatusHistory
    @ReferenceNumber varchar(20)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT h.HistoryId, h.FromStatus, h.ToStatus, h.ChangedAt, h.ChangedBy, h.Note
    FROM dbo.ApplicationStatusHistory h
    INNER JOIN dbo.Applications a ON a.ApplicationId = h.ApplicationId
    WHERE a.ReferenceNumber = @ReferenceNumber
END
GO
