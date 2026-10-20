using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;

namespace Permits.MonoPreview
{
    // Mono renders Web Forms client IDs with the automatic IDs of the master page and
    // of data rows (ctl00_MainContent_Grid_ctl02_Cell_0). .NET Framework 4.x in Predictable
    // mode leaves them out (MainContent_Grid_Cell_0). This module strips those segments from
    // HTML responses so the preview shows the IDs the Windows runner shows.
    public class PredictableClientIdModule : IHttpModule
    {
        public void Init(HttpApplication application)
        {
            application.PostRequestHandlerExecute += OnPostRequestHandlerExecute;
        }

        public void Dispose()
        {
        }

        private static void OnPostRequestHandlerExecute(object sender, EventArgs e)
        {
            var response = ((HttpApplication)sender).Response;
            if (response.ContentType == "text/html")
            {
                response.Filter = new ClientIdFilter(response.Filter, response.ContentEncoding);
            }
        }
    }

    internal sealed class ClientIdFilter : Stream
    {
        private static readonly Regex AutomaticIdSegment = new Regex(@"(?<![A-Za-z0-9])ctl\d+_", RegexOptions.Compiled);

        private readonly Stream _inner;
        private readonly Encoding _encoding;
        private readonly MemoryStream _buffer = new MemoryStream();
        private bool _closed;

        public ClientIdFilter(Stream inner, Encoding encoding)
        {
            _inner = inner;
            _encoding = encoding;
        }

        public override bool CanRead { get { return false; } }
        public override bool CanSeek { get { return false; } }
        public override bool CanWrite { get { return true; } }
        public override long Length { get { return _buffer.Length; } }
        public override long Position { get { return _buffer.Position; } set { throw new NotSupportedException(); } }

        public override void Write(byte[] buffer, int offset, int count)
        {
            _buffer.Write(buffer, offset, count);
        }

        public override void Flush()
        {
        }

        public override void Close()
        {
            if (!_closed)
            {
                _closed = true;
                var html = AutomaticIdSegment.Replace(_encoding.GetString(_buffer.ToArray()), string.Empty);
                var bytes = _encoding.GetBytes(html);
                _inner.Write(bytes, 0, bytes.Length);
                _inner.Flush();
                _inner.Close();
            }

            base.Close();
        }

        public override int Read(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
        public override long Seek(long offset, SeekOrigin origin) { throw new NotSupportedException(); }
        public override void SetLength(long value) { throw new NotSupportedException(); }
    }
}
