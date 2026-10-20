SET NOCOUNT ON
GO

INSERT INTO dbo.PermitTypes (Code, Name, BaseFee, RatePerSqM, ReviewBusinessDays, IsActive) VALUES ('RENO', N'Home renovation', 150.00, 2.35, 10, 1)
INSERT INTO dbo.PermitTypes (Code, Name, BaseFee, RatePerSqM, ReviewBusinessDays, IsActive) VALUES ('DECK', N'Deck or porch', 95.00, 1.80, 5, 1)
INSERT INTO dbo.PermitTypes (Code, Name, BaseFee, RatePerSqM, ReviewBusinessDays, IsActive) VALUES ('SIGN', N'Commercial sign', 120.00, 4.15, 7, 1)
INSERT INTO dbo.PermitTypes (Code, Name, BaseFee, RatePerSqM, ReviewBusinessDays, IsActive) VALUES ('PATIO', N'Sidewalk patio', 210.00, 3.10, 15, 1)
INSERT INTO dbo.PermitTypes (Code, Name, BaseFee, RatePerSqM, ReviewBusinessDays, IsActive) VALUES ('DEMO', N'Demolition', 300.00, 1.25, 20, 1)
INSERT INTO dbo.PermitTypes (Code, Name, BaseFee, RatePerSqM, ReviewBusinessDays, IsActive) VALUES ('EVENT', N'Special event', 75.00, 0.00, 3, 1)
INSERT INTO dbo.PermitTypes (Code, Name, BaseFee, RatePerSqM, ReviewBusinessDays, IsActive) VALUES ('FENCE', N'Fence', 60.00, 0.90, 5, 0)
GO
