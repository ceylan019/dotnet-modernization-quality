#!/bin/sh
# Serves a copy of the built legacy/src/Permits.Web folder (mounted read-only at /src)
# so the committed web.config is never edited.
set -eu

: "${PERMITS_DB:?PERMITS_DB connection string is required}"
: "${FIXED_TODAY:?FIXED_TODAY is required}"

if [ ! -f /src/bin/Permits.Web.dll ]; then
    echo "Permits.Web.dll not found. Build first: dotnet build legacy/Permits.Legacy.sln -c Release" >&2
    exit 1
fi

rm -rf /srv/app
cp -R /src /srv/app
cp /opt/preview/Permits.MonoPreview.dll /srv/app/bin/
mono /opt/preview/SetConfig.exe /srv/app/web.config "$PERMITS_DB" "$FIXED_TODAY"

exec xsp4 --address 0.0.0.0 --port 8080 --root /srv/app --applications /:/srv/app --nonstop
