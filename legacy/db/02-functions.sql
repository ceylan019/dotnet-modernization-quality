SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE FUNCTION dbo.fn_AddBusinessDays (@Start date, @Days int)
RETURNS date
AS
BEGIN
    DECLARE @d date = @Start
    DECLARE @counted int = 0

    WHILE @counted < @Days
    BEGIN
        SET @d = DATEADD(day, 1, @d)
        IF DATENAME(weekday, @d) NOT IN ('Saturday', 'Sunday')
           AND NOT EXISTS (SELECT 1 FROM dbo.Holidays WHERE HolidayDate = @d)
        BEGIN
            SET @counted = @counted + 1
        END
    END

    RETURN @d
END
GO

CREATE FUNCTION dbo.fn_EffectiveStatus (@Status varchar(20), @LastUpdatedAt datetime, @Today date)
RETURNS varchar(20)
AS
BEGIN
    IF @Status IN ('Submitted', 'InfoRequested') AND DATEDIFF(day, @LastUpdatedAt, @Today) > 180
        RETURN 'Expired'

    RETURN @Status
END
GO
