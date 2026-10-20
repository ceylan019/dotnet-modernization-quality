# Local preview of the legacy Web Forms app on Mono and xsp4.
# Test aid only: official results come from .NET Framework on the Windows runner.
FROM mono:6.12

# Debian 10 moved to archive.debian.org; the image's default sources no longer resolve.
RUN printf 'deb http://archive.debian.org/debian buster main\ndeb http://archive.debian.org/debian-security buster/updates main\n' > /etc/apt/sources.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends mono-xsp4 \
    && rm -rf /var/lib/apt/lists/*

COPY SetConfig.cs PredictableClientIdModule.cs start.sh /opt/preview/
RUN mcs -r:System.Xml.dll -out:/opt/preview/SetConfig.exe /opt/preview/SetConfig.cs \
    && mcs -target:library -r:System.Web.dll -out:/opt/preview/Permits.MonoPreview.dll /opt/preview/PredictableClientIdModule.cs

EXPOSE 8080
ENTRYPOINT ["sh", "/opt/preview/start.sh"]
