using System;
using System.Xml;

// Prepares the preview copy of web.config: connection string, FixedToday and the
// module that emulates .NET Framework client IDs (see PredictableClientIdModule.cs).
public static class SetConfig
{
    public static int Main(string[] args)
    {
        if (args.Length != 3)
        {
            Console.Error.WriteLine("Usage: mono SetConfig.exe <web.config> <connection string> <fixed today>");
            return 2;
        }

        var document = new XmlDocument();
        document.PreserveWhitespace = true;
        document.Load(args[0]);
        SetEntry(document, "connectionStrings", "name", "PermitsDb", "connectionString", args[1]);
        SetEntry(document, "appSettings", "key", "FixedToday", "value", args[2]);
        SetEntry(document, "system.web/httpModules", "name", "PredictableClientIds", "type", "Permits.MonoPreview.PredictableClientIdModule, Permits.MonoPreview");
        document.Save(args[0]);
        return 0;
    }

    private static void SetEntry(XmlDocument document, string sectionPath, string keyAttribute, string key, string valueAttribute, string value)
    {
        var section = EnsureElement(document, document.DocumentElement, sectionPath.Split('/'), 0);
        var entry = (XmlElement)section.SelectSingleNode("add[@" + keyAttribute + "='" + key + "']");
        if (entry == null)
        {
            entry = document.CreateElement("add");
            entry.SetAttribute(keyAttribute, key);
            section.AppendChild(entry);
        }

        entry.SetAttribute(valueAttribute, value);
    }

    private static XmlElement EnsureElement(XmlDocument document, XmlElement parent, string[] names, int index)
    {
        if (index == names.Length)
        {
            return parent;
        }

        var child = (XmlElement)parent.SelectSingleNode(names[index]);
        if (child == null)
        {
            child = document.CreateElement(names[index]);
            parent.AppendChild(child);
        }

        return EnsureElement(document, child, names, index + 1);
    }
}
